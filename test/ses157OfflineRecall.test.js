import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  CONNECTIVITY_STATES,
} from "../src/offline/connectivityPort.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../src/offline/secureDeliveryOfflineReadService.js";
import {
  SYNC_STATES,
  createForegroundSyncCoordinator,
} from "../src/offline/syncCoordinator.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";
import {
  makeChordBoardPracticeItem,
} from "./support/chordBoardFixtures.js";

const session = createStudentSession({
  studentId: "student-a",
});

const cachedAt = "2026-09-24T08:30:00Z";
const verifiedAt = "2026-09-24T09:00:00Z";

function pieceManifest() {
  return Object.freeze({
    schemaVersion: "1.0.0",
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "Yavaş çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: Object.freeze({
      scoreAssignmentId: "assignment-score-a",
      chordAssignmentIds: Object.freeze([
        "assignment-chord-a",
        "assignment-chord-b",
      ]),
    }),
  });
}

function scorePracticeItem() {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: "assignment-score-a",
    }),
    practiceType: "SCORE",
    package: makeApprovedPracticePackage({
      packageId: "pkg-score-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  });
}

async function seedAuthorityGraph({
  includeChordB = true,
} = {}) {
  const repository =
    createInMemoryOfflineRepository();

  await repository.putPieceManifest({
    studentId: "student-a",
    piece: pieceManifest(),
    cachedAt,
    lastVerifiedAt: cachedAt,
  });

  const practiceItems = [
    scorePracticeItem(),
    makeChordBoardPracticeItem({
      assignmentId: "assignment-chord-a",
    }),
  ];

  if (includeChordB) {
    practiceItems.push(
      makeChordBoardPracticeItem({
        assignmentId: "assignment-chord-b",
      }),
    );
  }

  for (const practiceItem of practiceItems) {
    await repository.putAuthorized({
      studentId: "student-a",
      practiceItem,
      cachedAt,
      lastVerifiedAt: cachedAt,
    });
  }

  return repository;
}

function expectedPackageId(accessRef) {
  return accessRef.deliveryId ===
    "assignment-score-a"
    ? "pkg-score-a"
    : accessRef.deliveryId;
}

function childAccessRef(deliveryId) {
  return {
    kind: "SECURE_DELIVERY",
    deliveryId,
  };
}

function activeChildStatusService({
  getPieceStatus,
}) {
  return {
    async getAccessStatus({
      accessRef,
    }) {
      return {
        state: "ACTIVE",
        packageId:
          expectedPackageId(
            accessRef,
          ),
      };
    },
    getPieceStatus,
  };
}

function coordinatorFor(
  repository,
  secureDeliveryStatusService,
) {
  return createForegroundSyncCoordinator({
    offlineRepository: repository,
    publicationStatusService: {
      async getPublicationStatus() {
        throw new Error("unused");
      },
    },
    secureDeliveryStatusService,
    clock: () => verifiedAt,
  });
}

async function assertGraphInactive(
  repository,
  childIds = [
    "assignment-score-a",
    "assignment-chord-a",
    "assignment-chord-b",
  ],
) {
  assert.equal(
    await repository.getActivePieceManifest({
      studentId: "student-a",
      pieceAssignmentId: "piece-a",
    }),
    null,
  );

  for (const deliveryId of childIds) {
    assert.equal(
      await repository.getActiveByAccessRef({
        studentId: "student-a",
        accessRef:
          childAccessRef(deliveryId),
      }),
      null,
      `${deliveryId} must be unauthorized after Piece revoke`,
    );
  }
}

function offlineReadService(repository) {
  const mustNotRun = async () => {
    throw new Error(
      "network must not run while offline",
    );
  };

  return createSecureDeliveryOfflineReadService({
    onlineReadService: {
      listPoolItems: mustNotRun,
      getPoolItem: mustNotRun,
      listAssignments: mustNotRun,
      getAssignment: mustNotRun,
      getScorePracticeItem: mustNotRun,
      getChordBoardPracticeItem:
        mustNotRun,
      listPieces: mustNotRun,
      getPiece: mustNotRun,
      getPieceScoreItem: mustNotRun,
      listPieceChordItems: mustNotRun,
    },
    offlineRepository: repository,
    connectivityPort: {
      getState() {
        return CONNECTIVITY_STATES.OFFLINE;
      },
    },
  });
}

test("SES-157 successful reconnect revoke disables Piece and every cached child authority", async () => {
  const repository =
    await seedAuthorityGraph();

  const coordinator = coordinatorFor(
    repository,
    activeChildStatusService({
      async getPieceStatus({
        pieceAssignmentId,
      }) {
        assert.equal(
          pieceAssignmentId,
          "piece-a",
        );
        return {
          state: "REVOKED",
        };
      },
    }),
  );

  const result = await coordinator.sync({
    session,
  });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNCED,
    checked: 4,
    revoked: 1,
    failed: 0,
  });
  await assertGraphInactive(repository);
});

test("SES-157 successful reconnect revoke blocks direct offline Piece SCORE and chord opens", async () => {
  const repository =
    await seedAuthorityGraph();
  const coordinator = coordinatorFor(
    repository,
    activeChildStatusService({
      async getPieceStatus() {
        return {
          state: "REVOKED",
        };
      },
    }),
  );

  await coordinator.sync({ session });

  const service =
    offlineReadService(repository);

  await assert.rejects(
    () =>
      service.getPiece({
        session,
        pieceAssignmentId: "piece-a",
      }),
    /offline Piece manifest unavailable/i,
  );
  await assert.rejects(
    () =>
      service.getScorePracticeItem({
        session,
        assignmentId: "assignment-score-a",
      }),
    /offline practice unavailable/i,
  );

  for (const assignmentId of [
    "assignment-chord-a",
    "assignment-chord-b",
  ]) {
    await assert.rejects(
      () =>
        service.getChordBoardPracticeItem({
          session,
          assignmentId,
        }),
      /offline practice unavailable/i,
    );
  }
});

test("SES-157 transient Piece status failure preserves the full cached graph and later revoke is retry-safe", async () => {
  const repository =
    await seedAuthorityGraph();
  let pieceAttempt = 0;

  const coordinator = coordinatorFor(
    repository,
    activeChildStatusService({
      async getPieceStatus() {
        pieceAttempt += 1;
        if (pieceAttempt === 1) {
          throw new Error(
            "temporary network failure",
          );
        }
        return {
          state: "REVOKED",
        };
      },
    }),
  );

  const failedResult =
    await coordinator.sync({
      session,
    });

  assert.deepEqual(failedResult, {
    state: SYNC_STATES.SYNC_ERROR,
    checked: 4,
    revoked: 0,
    failed: 1,
  });
  assert.equal(
    JSON.stringify(failedResult).includes(
      "temporary network failure",
    ),
    false,
  );
  assert.notEqual(
    await repository.getActivePieceManifest({
      studentId: "student-a",
      pieceAssignmentId: "piece-a",
    }),
    null,
  );

  for (const deliveryId of [
    "assignment-score-a",
    "assignment-chord-a",
    "assignment-chord-b",
  ]) {
    assert.notEqual(
      await repository.getActiveByAccessRef({
        studentId: "student-a",
        accessRef:
          childAccessRef(deliveryId),
      }),
      null,
    );
  }

  const retryResult =
    await coordinator.sync({
      session,
    });

  assert.deepEqual(retryResult, {
    state: SYNC_STATES.SYNCED,
    checked: 4,
    revoked: 1,
    failed: 0,
  });
  await assertGraphInactive(repository);
});

test("SES-157 Piece revoke tolerates a missing child cache without inventing authority", async () => {
  const repository =
    await seedAuthorityGraph({
      includeChordB: false,
    });
  const missingRef = childAccessRef(
    "assignment-chord-b",
  );

  assert.equal(
    await repository.getActiveByAccessRef({
      studentId: "student-a",
      accessRef: missingRef,
    }),
    null,
  );

  const coordinator = coordinatorFor(
    repository,
    activeChildStatusService({
      async getPieceStatus() {
        return {
          state: "REVOKED",
        };
      },
    }),
  );

  const result = await coordinator.sync({
    session,
  });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNCED,
    checked: 3,
    revoked: 1,
    failed: 0,
  });
  await assertGraphInactive(
    repository,
    [
      "assignment-score-a",
      "assignment-chord-a",
    ],
  );
  assert.equal(
    await repository.getActiveByAccessRef({
      studentId: "student-a",
      accessRef: missingRef,
    }),
    null,
  );
});