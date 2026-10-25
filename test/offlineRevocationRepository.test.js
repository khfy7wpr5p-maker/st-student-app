import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import { createIndexedDbOfflineRepository } from "../src/offline/indexedDbOfflineRepository.js";
import { createOfflineRecord } from "../src/offline/offlineRecord.js";
import { createPieceOfflineRecord } from "../src/offline/pieceOfflineRecord.js";
import { makeApprovedPracticePackage } from "./support/practiceFixtures.js";

const now = "2026-10-25T10:00:00Z";
const ref = (deliveryId = "score-a") => ({ kind: "SECURE_DELIVERY", deliveryId });
const piece = (id = "piece-a") => ({
  schemaVersion: "1.0.0", pieceAssignmentId: id, pieceId: "work-a", arrangementId: "arr-a",
  title: "Etüd", teacherNote: "", state: "ACTIVE", assignedAt: now,
  contentRefs: { scoreAssignmentId: "score-a", chordAssignmentIds: ["chord-a"] },
});
const putArgs = (deliveryId = "score-a", packageId = "pkg-a", studentId = "student-a") => ({
  studentId, cachedAt: now, lastVerifiedAt: now,
  practiceItem: { accessRef: ref(deliveryId), practiceType: "SCORE",
    package: makeApprovedPracticePackage({ packageId, scope: "student_private", recipientStudentId: "server-student-a" }) },
});
const pieceArgs = { studentId: "student-a", piece: piece(), cachedAt: now, lastVerifiedAt: now };
const revokeArgs = { studentId: "student-a", lastVerifiedAt: now };

for (const kind of ["memory", "indexeddb"]) {
  const factory = () => kind === "memory" ? createInMemoryOfflineRepository()
    : createIndexedDbOfflineRepository({ indexedDB: new IDBFactory() });

  test(`${kind}: revoked Piece cannot be resurrected by a delayed list response`, async () => {
    const repo = factory();
    await repo.putPieceManifest(pieceArgs);
    await repo.markPieceManifestRevoked({ ...revokeArgs, pieceAssignmentId: "piece-a" });
    await repo.putPieceManifest(pieceArgs);
    assert.deepEqual(await repo.listActivePieceManifests({ studentId: "student-a" }), []);
  });

  test(`${kind}: revoke before first package save survives delayed and different-package writes`, async () => {
    const repo = factory();
    await repo.markRevoked({ ...revokeArgs, accessRef: ref() });
    await repo.putAuthorized(putArgs());
    await repo.putAuthorized(putArgs("score-a", "pkg-late"));
    assert.equal(await repo.getActiveByAccessRef({ studentId: "student-a", accessRef: ref() }), null);
    assert.equal(await repo.isAccessRevoked({ studentId: "student-a", accessRef: ref() }), true);
  });

  test(`${kind}: atomic Piece revoke disables uncached children and preserves other students and identities`, async () => {
    const repo = factory();
    await repo.putPieceManifest(pieceArgs);
    await repo.putAuthorized(putArgs());
    await repo.putAuthorized(putArgs("unrelated", "pkg-other"));
    await repo.putAuthorized(putArgs("score-a", "pkg-a", "student-b"));
    await repo.revokePieceAccess({ ...revokeArgs, pieceAssignmentId: "piece-a" });
    await repo.putAuthorized(putArgs("chord-a", "pkg-late-child"));
    assert.equal(await repo.getActivePieceManifest({ studentId: "student-a", pieceAssignmentId: "piece-a" }), null);
    for (const deliveryId of ["score-a", "chord-a"]) {
      assert.equal(await repo.getActiveByAccessRef({ studentId: "student-a", accessRef: ref(deliveryId) }), null);
    }
    assert.notEqual(await repo.getActiveByAccessRef({ studentId: "student-b", accessRef: ref() }), null);
    assert.notEqual(await repo.getActiveByAccessRef({ studentId: "student-a", accessRef: ref("unrelated") }), null);
    await repo.putAuthorized(putArgs("new-delivery", "new-package"));
    assert.notEqual(await repo.getActiveByAccessRef({ studentId: "student-a", accessRef: ref("new-delivery") }), null);
  });
}

test("IndexedDB: access revocation survives a second connection/restart", async () => {
  const indexedDB = new IDBFactory();
  const repo = createIndexedDbOfflineRepository({ indexedDB });
  await repo.markRevoked({ ...revokeArgs, accessRef: ref() });
  const reopened = createIndexedDbOfflineRepository({ indexedDB });
  await reopened.putAuthorized(putArgs());
  assert.equal(await reopened.getActiveByAccessRef({ studentId: "student-a", accessRef: ref() }), null);
});

async function seedV3(indexedDB, { revoked = false } = {}) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("st-student-app", 3);
    request.onupgradeneeded = () => {
      const packages = request.result.createObjectStore("practicePackages", { keyPath: "cacheKey" });
      for (const [name, key] of [["byStudent", "studentId"], ["byStudentScope", "studentScopeKey"],
        ["byStudentPublication", "studentPublicationKey"], ["byStudentAccess", "studentAccessKey"]]) {
        packages.createIndex(name, key);
      }
      request.result.createObjectStore("pieceManifests", { keyPath: "cacheKey" }).createIndex("byStudent", "studentId");
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(["practicePackages", "pieceManifests"], "readwrite");
  const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
  tx.objectStore("practicePackages").put({ ...createOfflineRecord({ ...putArgs(), accessState: "ACTIVE" }),
    accessState: revoked ? "REVOKED" : "ACTIVE",
    cacheKey: "student-a\u0000SECURE_DELIVERY:score-a\u0000pkg-a",
    studentScopeKey: "student-a\u0000student_private", studentAccessKey: "student-a\u0000SECURE_DELIVERY:score-a" });
  tx.objectStore("pieceManifests").put({ ...createPieceOfflineRecord(pieceArgs),
    accessState: revoked ? "REVOKED" : "ACTIVE", cacheKey: "student-a\u0000piece-a" });
  await done; db.close();
}

test("IndexedDB: genuine v3 upgrade preserves valid cached packages and Piece manifests", async () => {
  const indexedDB = new IDBFactory(); await seedV3(indexedDB);
  const upgraded = createIndexedDbOfflineRepository({ indexedDB });
  assert.notEqual(await upgraded.getActiveByAccessRef({ studentId: "student-a", accessRef: ref() }), null);
  assert.notEqual(await upgraded.getActivePieceManifest({ studentId: "student-a", pieceAssignmentId: "piece-a" }), null);
  await upgraded.markRevoked({ ...revokeArgs, accessRef: ref() });
  assert.equal(await upgraded.getActiveByAccessRef({ studentId: "student-a", accessRef: ref() }), null);
});

test("IndexedDB: v3 revoked Piece migration also blocks a late uncached child", async () => {
  const indexedDB = new IDBFactory(); await seedV3(indexedDB, { revoked: true });
  const upgraded = createIndexedDbOfflineRepository({ indexedDB });
  await upgraded.putAuthorized(putArgs("chord-a", "late-child"));
  assert.equal(await upgraded.getActiveByAccessRef({ studentId: "student-a", accessRef: ref("chord-a") }), null);
});

test("IndexedDB: aborted graph revocation rolls back Piece, packages and tombstones together", async () => {
  const repo = createIndexedDbOfflineRepository({ indexedDB: new IDBFactory() });
  await repo.putPieceManifest(pieceArgs); await repo.putAuthorized(putArgs());
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, ...args) {
    if (this.name === "pieceManifests" && value.accessState === "REVOKED") throw new Error("simulated write failure");
    return original.call(this, value, ...args);
  };
  try {
    await assert.rejects(() => repo.revokePieceAccess({ ...revokeArgs, pieceAssignmentId: "piece-a" }), /simulated write failure/);
  } finally { IDBObjectStore.prototype.put = original; }
  assert.notEqual(await repo.getActivePieceManifest({ studentId: "student-a", pieceAssignmentId: "piece-a" }), null);
  assert.notEqual(await repo.getActiveByAccessRef({ studentId: "student-a", accessRef: ref() }), null);
  assert.equal(await repo.isAccessRevoked({ studentId: "student-a", accessRef: ref() }), false);
});
