import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";

import { createIndexedDbOfflineRepository } from "../src/offline/indexedDbOfflineRepository.js";
import {
  makeApprovedPracticePackage,
  makeDelivery,
  makePrivateDelivery,
  makePutArgs,
} from "./support/practiceFixtures.js";
import {
  makeChordBoardPracticeItem,
} from "./support/chordBoardFixtures.js";

let sequence = 0;
const dbName = (name) => `st-student-${name}-${sequence += 1}`;

test("IndexedDB persists and reopens a student-scoped package", async () => {
  const name = dbName("reopen");
  const first = createIndexedDbOfflineRepository({ indexedDB, dbName: name });
  await first.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")),
  );

  const reopened = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: name,
  });
  const found = await reopened.getActiveByPublicationId({
    studentId: "student-a",
    publicationId: "pub-a",
  });

  assert.equal(found.packageId, "pkg-a");
  assert.equal(found.studentId, "student-a");
  assert.equal(Object.isFrozen(found), true);
});

test("IndexedDB scope query cannot cross student boundary", async () => {
  const repo = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: dbName("isolation"),
  });
  await repo.putAuthorized(
    makePutArgs("student-a", makePrivateDelivery("student-a")),
  );

  assert.deepEqual(
    await repo.listActiveForStudent({
      studentId: "student-b",
      scope: "student_private",
    }),
    [],
  );
});

test("IndexedDB revocation survives repository reopen", async () => {
  const name = dbName("revoke");
  const repo = createIndexedDbOfflineRepository({ indexedDB, dbName: name });
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")),
  );
  await repo.markRevoked({
    studentId: "student-a",
    publicationId: "pub-a",
    lastVerifiedAt: "2026-09-21T14:00:00Z",
  });

  const reopened = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: name,
  });
  assert.equal(
    await reopened.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
});

test("IndexedDB preserves package versions and opens the newest cached version", async () => {
  const repo = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: dbName("versions"),
  });
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-a"), {
      cachedAt: "2026-09-21T12:00:00Z",
      lastVerifiedAt: "2026-09-21T12:00:00Z",
    }),
  );
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-b"), {
      cachedAt: "2026-09-21T13:00:00Z",
      lastVerifiedAt: "2026-09-21T13:00:00Z",
    }),
  );

  const stored = await repo.listAllForStudent({ studentId: "student-a" });
  assert.deepEqual(
    stored.map((record) => record.packageId).sort(),
    ["pkg-a", "pkg-b"],
  );

  const active = await repo.getActiveByPublicationId({
    studentId: "student-a",
    publicationId: "pub-a",
  });
  assert.equal(active.packageId, "pkg-b");

  const visible = await repo.listActiveForStudent({
    studentId: "student-a",
  });
  assert.deepEqual(
    visible.map((record) => record.packageId),
    ["pkg-b"],
  );
});


test("IndexedDB revocation blocks every cached version of a publication", async () => {
  const repo = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: dbName("revoke-versions"),
  });
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-old"), {
      cachedAt: "2026-09-21T12:00:00Z",
      lastVerifiedAt: "2026-09-21T12:00:00Z",
    }),
  );
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-new"), {
      cachedAt: "2026-09-21T13:00:00Z",
      lastVerifiedAt: "2026-09-21T13:00:00Z",
    }),
  );

  await repo.markRevoked({
    studentId: "student-a",
    publicationId: "pub-a",
    lastVerifiedAt: "2026-09-21T14:00:00Z",
  });

  const stored = await repo.listAllForStudent({ studentId: "student-a" });
  assert.equal(
    stored.every((record) => record.accessState === "REVOKED"),
    true,
  );
  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
});

test("IndexedDB exact package verification refreshes only the matching immutable version", async () => {
  const repo = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: dbName("verify-exact-version"),
  });
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-old"), {
      cachedAt: "2026-09-21T12:00:00Z",
      lastVerifiedAt: "2026-09-21T12:00:00Z",
    }),
  );
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-new"), {
      cachedAt: "2026-09-21T13:00:00Z",
      lastVerifiedAt: "2026-09-21T13:00:00Z",
    }),
  );

  await repo.markVerifiedActive({
    studentId: "student-a",
    publicationId: "pub-a",
    packageId: "pkg-new",
    lastVerifiedAt: "2026-09-21T15:00:00Z",
  });

  const stored = await repo.listAllForStudent({ studentId: "student-a" });
  const oldRecord = stored.find((record) => record.packageId === "pkg-old");
  const newRecord = stored.find((record) => record.packageId === "pkg-new");

  assert.equal(oldRecord.lastVerifiedAt, "2026-09-21T12:00:00Z");
  assert.equal(newRecord.lastVerifiedAt, "2026-09-21T15:00:00Z");
});


function makeSecurePractice(
  deliveryId = "assignment-a",
  packageId = "pkg-secure",
) {
  return {
    accessRef: {
      kind: "SECURE_DELIVERY",
      deliveryId,
    },
    practiceType: "SCORE",
    package: makeApprovedPracticePackage({
      packageId,
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  };
}

async function seedLegacyV1Database(name) {
  const delivery = makeDelivery(
    "pub-legacy",
    "pkg-legacy",
  );
  const request = indexedDB.open(name, 1);

  const db = await new Promise(
    (resolve, reject) => {
      request.onupgradeneeded = () => {
        const created =
          request.result.createObjectStore(
            "practicePackages",
            {
              keyPath: "cacheKey",
            },
          );
        created.createIndex(
          "byStudent",
          "studentId",
          { unique: false },
        );
        created.createIndex(
          "byStudentScope",
          "studentScopeKey",
          { unique: false },
        );
        created.createIndex(
          "byStudentPublication",
          "studentPublicationKey",
          { unique: false },
        );
      };
      request.onsuccess = () =>
        resolve(request.result);
      request.onerror = () =>
        reject(request.error);
    },
  );

  const tx = db.transaction(
    "practicePackages",
    "readwrite",
  );
  tx.objectStore("practicePackages").put({
    studentId: "student-a",
    publicationId: "pub-legacy",
    packageId: "pkg-legacy",
    scope: "public_pool",
    publication: delivery.publication,
    package: delivery.package,
    cachedAt: "2026-09-21T12:00:00Z",
    lastVerifiedAt:
      "2026-09-21T12:00:00Z",
    accessState: "ACTIVE",
    cacheKey:
      "student-a\u0000pub-legacy\u0000pkg-legacy",
    studentScopeKey:
      "student-a\u0000public_pool",
    studentPublicationKey:
      "student-a\u0000pub-legacy",
  });

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  db.close();
}

test("IndexedDB persists Secure Delivery accessRef without cross-account leakage", async () => {
  const name = dbName("secure-delivery");
  const first =
    createIndexedDbOfflineRepository({
      indexedDB,
      dbName: name,
    });

  await first.putAuthorized({
    studentId: "firebase-uid-a",
    practiceItem: makeSecurePractice(),
    cachedAt: "2026-09-23T11:00:00Z",
    lastVerifiedAt:
      "2026-09-23T11:00:00Z",
  });

  const reopened =
    createIndexedDbOfflineRepository({
      indexedDB,
      dbName: name,
    });

  const cached =
    await reopened.getActiveByAccessRef({
      studentId: "firebase-uid-a",
      accessRef: {
        kind: "SECURE_DELIVERY",
        deliveryId: "assignment-a",
      },
    });

  assert.equal(cached.packageId, "pkg-secure");
  assert.deepEqual(cached.accessRef, {
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  });
  assert.equal(
    await reopened.getActiveByAccessRef({
      studentId: "firebase-uid-b",
      accessRef: cached.accessRef,
    }),
    null,
  );
});

test("IndexedDB v1 publication cache migrates additively to PUBLICATION accessRef", async () => {
  const name = dbName("v1-migration");
  await seedLegacyV1Database(name);

  const reopened =
    createIndexedDbOfflineRepository({
      indexedDB,
      dbName: name,
    });

  const legacy =
    await reopened.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-legacy",
    });

  assert.equal(legacy.packageId, "pkg-legacy");
  assert.deepEqual(legacy.accessRef, {
    kind: "PUBLICATION",
    publicationId: "pub-legacy",
  });

  const generic =
    await reopened.getActiveByAccessRef({
      studentId: "student-a",
      accessRef: {
        kind: "PUBLICATION",
        publicationId: "pub-legacy",
      },
    });

  assert.equal(generic.packageId, "pkg-legacy");
});


function makeChordSecurePractice(
  deliveryId = "assignment-chord-a",
) {
  return makeChordBoardPracticeItem({
    assignmentId: deliveryId,
  });
}

async function seedLegacySecureScoreDatabase(
  name,
) {
  const pkg =
    makeApprovedPracticePackage({
      packageId: "pkg-legacy-secure",
      scope: "student_private",
      recipientStudentId:
        "server-student-a",
    });
  const request = indexedDB.open(name, 2);

  const db = await new Promise(
    (resolve, reject) => {
      request.onupgradeneeded = () => {
        const store =
          request.result
            .createObjectStore(
              "practicePackages",
              {
                keyPath: "cacheKey",
              },
            );

        store.createIndex(
          "byStudent",
          "studentId",
          { unique: false },
        );
        store.createIndex(
          "byStudentScope",
          "studentScopeKey",
          { unique: false },
        );
        store.createIndex(
          "byStudentPublication",
          "studentPublicationKey",
          { unique: false },
        );
        store.createIndex(
          "byStudentAccess",
          "studentAccessKey",
          { unique: false },
        );
      };
      request.onsuccess = () =>
        resolve(request.result);
      request.onerror = () =>
        reject(request.error);
    },
  );

  const accessRef = {
    kind: "SECURE_DELIVERY",
    deliveryId:
      "assignment-legacy-score",
  };
  const accessKey =
    "SECURE_DELIVERY:assignment-legacy-score";
  const studentId =
    "firebase-uid-a";

  const tx = db.transaction(
    "practicePackages",
    "readwrite",
  );
  tx.objectStore(
    "practicePackages",
  ).put({
    studentId,
    accessRef,
    accessKey,
    packageId:
      "pkg-legacy-secure",
    scope: "student_private",
    publication: null,
    package: pkg,
    cachedAt:
      "2026-09-23T11:00:00Z",
    lastVerifiedAt:
      "2026-09-23T11:00:00Z",
    accessState: "ACTIVE",
    cacheKey:
      `${studentId}\u0000SECURE_DELIVERY:assignment-legacy-score\u0000pkg-legacy-secure`,
    studentScopeKey:
      `${studentId}\u0000student_private`,
    studentAccessKey:
      `${studentId}\u0000${accessKey}`,
  });

  await new Promise(
    (resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () =>
        reject(tx.error);
      tx.onabort = () =>
        reject(tx.error);
    },
  );

  db.close();
}

test("IndexedDB persists and reopens explicit CHORD_BOARD practice type without changing access identity", async () => {
  const name =
    dbName("secure-chord");
  const first =
    createIndexedDbOfflineRepository({
      indexedDB,
      dbName: name,
    });

  await first.putAuthorized({
    studentId: "firebase-uid-a",
    practiceItem:
      makeChordSecurePractice(),
    cachedAt:
      "2026-09-23T11:00:00Z",
    lastVerifiedAt:
      "2026-09-23T11:00:00Z",
  });

  const reopened =
    createIndexedDbOfflineRepository({
      indexedDB,
      dbName: name,
    });

  const cached =
    await reopened.getActiveByAccessRef({
      studentId: "firebase-uid-a",
      accessRef: {
        kind: "SECURE_DELIVERY",
        deliveryId:
          "assignment-chord-a",
      },
    });

  assert.equal(
    cached.practiceType,
    "CHORD_BOARD",
  );
  assert.equal(
    cached.package.packageType,
    "CHORD_BOARD",
  );
  assert.deepEqual(
    cached.accessRef,
    {
      kind: "SECURE_DELIVERY",
      deliveryId:
        "assignment-chord-a",
    },
  );
});

test("IndexedDB restores legacy Secure Delivery SCORE records that predate practiceType", async () => {
  const name =
    dbName("legacy-secure-score");
  await seedLegacySecureScoreDatabase(
    name,
  );

  const reopened =
    createIndexedDbOfflineRepository({
      indexedDB,
      dbName: name,
    });

  const cached =
    await reopened.getActiveByAccessRef({
      studentId: "firebase-uid-a",
      accessRef: {
        kind: "SECURE_DELIVERY",
        deliveryId:
          "assignment-legacy-score",
      },
    });

  assert.equal(
    cached.practiceType,
    "SCORE",
  );
  assert.equal(
    cached.package.packageId,
    "pkg-legacy-secure",
  );
});


function offlinePieceManifest(
  pieceAssignmentId = "piece-a",
  state = "ACTIVE",
) {
  return {
    schemaVersion: "1.0.0",
    pieceAssignmentId,
    pieceId: `work-${pieceAssignmentId}`,
    arrangementId: `arr-${pieceAssignmentId}`,
    title: "Cambaz",
    teacherNote: "",
    state,
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: {
      scoreAssignmentId: "assignment-score-a",
      chordAssignmentIds: [],
    },
  };
}

test("Piece manifest cache stays student-scoped and revoke is one-way", async () => {
  const repo = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: dbName("piece-manifest"),
  });

  const piece = offlinePieceManifest();
  await repo.putPieceManifest({
    studentId: "firebase-uid-a",
    piece,
    cachedAt: "2026-09-24T09:00:00Z",
    lastVerifiedAt: "2026-09-24T09:00:00Z",
  });

  assert.equal(
    (
      await repo.getActivePieceManifest({
        studentId: "firebase-uid-a",
        pieceAssignmentId: "piece-a",
      })
    ).piece.pieceId,
    "work-piece-a",
  );
  assert.equal(
    await repo.getActivePieceManifest({
      studentId: "firebase-uid-b",
      pieceAssignmentId: "piece-a",
    }),
    null,
  );

  await repo.markPieceManifestRevoked({
    studentId: "firebase-uid-a",
    pieceAssignmentId: "piece-a",
    lastVerifiedAt: "2026-09-24T10:00:00Z",
  });

  assert.equal(
    await repo.getActivePieceManifest({
      studentId: "firebase-uid-a",
      pieceAssignmentId: "piece-a",
    }),
    null,
  );
  assert.deepEqual(
    await repo.listActivePieceManifests({
      studentId: "firebase-uid-a",
      state: "ACTIVE",
    }),
    [],
  );
});
