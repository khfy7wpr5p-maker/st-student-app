import test from "node:test";
import assert from "node:assert/strict";

import { OFFLINE_ACCESS_STATES } from "../src/offline/offlineRecord.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  makeDelivery,
  makePrivateDelivery,
  makePutArgs,
} from "./support/practiceFixtures.js";

test("repository never returns another student's cache", async () => {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized(
    makePutArgs("student-a", makePrivateDelivery("student-a")),
  );

  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-b",
      publicationId: "pub-private",
    }),
    null,
  );
  assert.deepEqual(
    await repo.listActiveForStudent({ studentId: "student-b" }),
    [],
  );
});

test("re-caching same immutable package is idempotent", async () => {
  const repo = createInMemoryOfflineRepository();
  const delivery = makeDelivery("pub-1", "pkg-1");

  await repo.putAuthorized(makePutArgs("student-a", delivery));
  await repo.putAuthorized(
    makePutArgs("student-a", delivery, {
      cachedAt: "2026-09-21T13:00:00Z",
      lastVerifiedAt: "2026-09-21T13:00:00Z",
    }),
  );

  const records = await repo.listAllForStudent({ studentId: "student-a" });
  assert.equal(records.length, 1);
  assert.equal(records[0].packageId, "pkg-1");
  assert.equal(records[0].lastVerifiedAt, "2026-09-21T13:00:00Z");
});

test("new package ids remain distinct immutable cache records", async () => {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-1", "pkg-1")),
  );
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-2", "pkg-2")),
  );

  const records = await repo.listAllForStudent({ studentId: "student-a" });
  assert.deepEqual(
    records.map((record) => record.packageId).sort(),
    ["pkg-1", "pkg-2"],
  );
});

test("same publication keeps immutable package versions and opens the newest cached version", async () => {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-1", "pkg-1"), {
      cachedAt: "2026-09-21T12:00:00Z",
      lastVerifiedAt: "2026-09-21T12:00:00Z",
    }),
  );
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-1", "pkg-2"), {
      cachedAt: "2026-09-21T13:00:00Z",
      lastVerifiedAt: "2026-09-21T13:00:00Z",
    }),
  );

  const stored = await repo.listAllForStudent({ studentId: "student-a" });
  assert.deepEqual(
    stored.map((record) => record.packageId).sort(),
    ["pkg-1", "pkg-2"],
  );

  const active = await repo.getActiveByPublicationId({
    studentId: "student-a",
    publicationId: "pub-1",
  });
  assert.equal(active.packageId, "pkg-2");

  const visible = await repo.listActiveForStudent({
    studentId: "student-a",
  });
  assert.deepEqual(
    visible.map((record) => record.packageId),
    ["pkg-2"],
  );
});
test("revoked records disappear from active reads but remain stored", async () => {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-1", "pkg-1")),
  );
  await repo.markRevoked({
    studentId: "student-a",
    publicationId: "pub-1",
    lastVerifiedAt: "2026-09-21T13:00:00Z",
  });

  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-1",
    }),
    null,
  );

  const stored = await repo.listAllForStudent({ studentId: "student-a" });
  assert.equal(stored[0].accessState, OFFLINE_ACCESS_STATES.REVOKED);

  await repo.markVerifiedActive({
    studentId: "student-a",
    publicationId: "pub-1",
    lastVerifiedAt: "2026-09-21T14:00:00Z",
  });
  assert.equal(
    (await repo.listAllForStudent({ studentId: "student-a" }))[0].accessState,
    OFFLINE_ACCESS_STATES.REVOKED,
  );
});
