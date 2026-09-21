import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  SYNC_STATES,
  createForegroundSyncCoordinator,
} from "../src/offline/syncCoordinator.js";
import {
  makeDelivery,
  makePutArgs,
} from "./support/practiceFixtures.js";

const studentA = createStudentSession({ studentId: "student-a" });

async function seededRepository() {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")),
  );
  return repo;
}

test("explicit REVOKED status blocks cached access", async () => {
  const repo = await seededRepository();
  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() {
        return { state: "REVOKED" };
      },
    },
    clock: () => "2026-09-21T15:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNCED,
    checked: 1,
    revoked: 1,
    failed: 0,
  });
  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
});

test("verification exception never revokes valid cache", async () => {
  const repo = await seededRepository();
  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() {
        throw new Error("network down");
      },
    },
    clock: () => "2026-09-21T15:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });

  assert.equal(result.state, SYNC_STATES.SYNC_ERROR);
  assert.equal(result.failed, 1);
  assert.notEqual(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
  assert.equal(JSON.stringify(result).includes("network down"), false);
});

test("ACTIVE verification updates lastVerifiedAt without replacing package", async () => {
  const repo = await seededRepository();
  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() {
        return { state: "ACTIVE", packageId: "pkg-a" };
      },
    },
    clock: () => "2026-09-21T16:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });
  const [record] = await repo.listAllForStudent({ studentId: "student-a" });

  assert.equal(result.state, SYNC_STATES.SYNCED);
  assert.equal(record.packageId, "pkg-a");
  assert.equal(record.lastVerifiedAt, "2026-09-21T16:00:00Z");
});

test("one failed verification does not stop another cached publication", async () => {
  const repo = await seededRepository();
  await repo.putAuthorized(
    makePutArgs("student-a", makeDelivery("pub-b", "pkg-b")),
  );

  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus({ publicationId }) {
        if (publicationId === "pub-a") {
          throw new Error("temporary provider failure");
        }
        return { state: "REVOKED" };
      },
    },
    clock: () => "2026-09-21T17:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNC_ERROR,
    checked: 2,
    revoked: 1,
    failed: 1,
  });
  assert.notEqual(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-b",
    }),
    null,
  );
});

test("invalid provider status is a failure, never an implicit revocation", async () => {
  const repo = await seededRepository();
  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() {
        return { state: "UNKNOWN" };
      },
    },
    clock: () => "2026-09-21T18:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });

  assert.equal(result.state, SYNC_STATES.SYNC_ERROR);
  assert.equal(result.failed, 1);
  assert.notEqual(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
});


test("sync accepts an active newer cached package without treating the preserved older snapshot as an error", async () => {
  const repo = createInMemoryOfflineRepository();
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

  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() {
        return { state: "ACTIVE", packageId: "pkg-new" };
      },
    },
    clock: () => "2026-09-21T16:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });
  const records = await repo.listAllForStudent({ studentId: "student-a" });
  const oldRecord = records.find((record) => record.packageId === "pkg-old");
  const newRecord = records.find((record) => record.packageId === "pkg-new");

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNCED,
    checked: 1,
    revoked: 0,
    failed: 0,
  });
  assert.equal(oldRecord.lastVerifiedAt, "2026-09-21T12:00:00Z");
  assert.equal(newRecord.lastVerifiedAt, "2026-09-21T16:00:00Z");
});

test("revocation blocks every cached package version of one publication", async () => {
  const repo = createInMemoryOfflineRepository();
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

  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() {
        return { state: "REVOKED" };
      },
    },
    clock: () => "2026-09-21T17:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });
  const records = await repo.listAllForStudent({ studentId: "student-a" });

  assert.equal(result.state, SYNC_STATES.SYNCED);
  assert.equal(result.checked, 1);
  assert.equal(result.revoked, 1);
  assert.equal(
    records.every((record) => record.accessState === "REVOKED"),
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


test("newer server package that is not cached does not revoke or invalidate the existing snapshot", async () => {
  const repo = await seededRepository();
  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() {
        return { state: "ACTIVE", packageId: "pkg-newer" };
      },
    },
    clock: () => "2026-09-21T19:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });
  const [record] = await repo.listAllForStudent({ studentId: "student-a" });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNCED,
    checked: 1,
    revoked: 0,
    failed: 0,
  });
  assert.equal(record.packageId, "pkg-a");
  assert.equal(record.accessState, "ACTIVE");
  assert.equal(record.lastVerifiedAt, "2026-09-21T12:00:00Z");
});
