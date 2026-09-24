import test from "node:test";
import assert from "node:assert/strict";

import { OFFLINE_ACCESS_STATES } from "../src/offline/offlineRecord.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  makeApprovedPracticePackage,
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

test("in-memory repository stores Secure Delivery by accessRef and local UID partition", async () => {
  const repo = createInMemoryOfflineRepository();

  await repo.putAuthorized({
    studentId: "firebase-uid-a",
    practiceItem: makeSecurePractice(),
    cachedAt: "2026-09-23T11:00:00Z",
    lastVerifiedAt: "2026-09-23T11:00:00Z",
  });

  const cached = await repo.getActiveByAccessRef({
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
  assert.equal(cached.publication, null);
  assert.equal(
    await repo.getActiveByAccessRef({
      studentId: "firebase-uid-b",
      accessRef: cached.accessRef,
    }),
    null,
  );
});

test("generic accessRef revocation applies to every Secure Delivery package version", async () => {
  const repo = createInMemoryOfflineRepository();
  const accessRef = {
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  };

  for (const [packageId, cachedAt] of [
    ["pkg-old", "2026-09-23T11:00:00Z"],
    ["pkg-new", "2026-09-23T12:00:00Z"],
  ]) {
    await repo.putAuthorized({
      studentId: "firebase-uid-a",
      practiceItem: makeSecurePractice(
        "assignment-a",
        packageId,
      ),
      cachedAt,
      lastVerifiedAt: cachedAt,
    });
  }

  await repo.markRevoked({
    studentId: "firebase-uid-a",
    accessRef,
    lastVerifiedAt: "2026-09-23T13:00:00Z",
  });

  assert.equal(
    await repo.getActiveByAccessRef({
      studentId: "firebase-uid-a",
      accessRef,
    }),
    null,
  );
  assert.equal(
    (
      await repo.listAllForStudent({
        studentId: "firebase-uid-a",
      })
    ).every(
      (record) =>
        record.accessState ===
        OFFLINE_ACCESS_STATES.REVOKED,
    ),
    true,
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
  const repo = createInMemoryOfflineRepository();

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
