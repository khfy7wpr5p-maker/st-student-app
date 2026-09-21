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

test("IndexedDB rejects conflicting package for same student publication", async () => {
  const repo = createIndexedDbOfflineRepository({
    indexedDB,
    dbName: dbName("conflict"),
  });
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")),
  );

  await assert.rejects(
    () =>
      repo.putAuthorized(
        makePutArgs("student-a", makeDelivery("pub-a", "pkg-b")),
      ),
    /different package/i,
  );
});
