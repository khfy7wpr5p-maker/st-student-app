import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";

import { createIndexedDbOfflineRepository } from "../src/offline/indexedDbOfflineRepository.js";
import {
  makeDelivery,
  makePrivateDelivery,
  makePutArgs,
} from "./support/practiceFixtures.js";

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
