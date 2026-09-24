import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { PRACTICE_TYPES } from "../src/contracts/privateAssignment.js";
import {
  CONNECTIVITY_STATES,
} from "../src/offline/connectivityPort.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../src/offline/secureDeliveryOfflineReadService.js";
import {
  createSecureDeliveryStatusService,
} from "../src/offline/secureDeliveryStatusService.js";
import {
  SYNC_STATES,
  createForegroundSyncCoordinator,
} from "../src/offline/syncCoordinator.js";
import {
  SecureDeliveryApiError,
} from "../src/providers/secureDelivery/secureDeliveryApiClient.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";
import {
  makeChordBoardPracticeItem,
} from "./support/chordBoardFixtures.js";

const session = createStudentSession({
  studentId: "student-a",
});

function pieceManifest({
  state = "ACTIVE",
  scoreAssignmentId = "assignment-score-a",
  chordAssignmentIds = [
    "assignment-chord-a",
  ],
} = {}) {
  return {
    schemaVersion: "1.0.0",
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "Yavaş çalış.",
    state,
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: {
      scoreAssignmentId,
      chordAssignmentIds,
    },
  };
}

async function seededPieceRepository() {
  const repository =
    createInMemoryOfflineRepository();

  await repository.putPieceManifest({
    studentId: "student-a",
    piece: pieceManifest(),
    cachedAt:
      "2026-09-24T08:30:00Z",
    lastVerifiedAt:
      "2026-09-24T08:30:00Z",
  });

  return repository;
}

test("Piece status maps exact NOT_FOUND to REVOKED", async () => {
  const service =
    createSecureDeliveryStatusService({
      apiClient: {
        async getStudentAssignment() {
          throw new Error("unused");
        },
        async getStudentPiece() {
          throw new SecureDeliveryApiError({
            status: 404,
            code: "NOT_FOUND",
            message: "not found",
          });
        },
      },
    });

  assert.deepEqual(
    await service.getPieceStatus({
      pieceAssignmentId: "piece-a",
    }),
    {
      state: "REVOKED",
    },
  );
});

test("Piece status preserves transient failures instead of inventing revocation", async () => {
  const service =
    createSecureDeliveryStatusService({
      apiClient: {
        async getStudentAssignment() {
          throw new Error("unused");
        },
        async getStudentPiece() {
          throw new SecureDeliveryApiError({
            status: 0,
            code:
              "SECURE_DELIVERY_UNAVAILABLE",
            message: "network down",
          });
        },
      },
    });

  await assert.rejects(
    () =>
      service.getPieceStatus({
        pieceAssignmentId: "piece-a",
      }),
    /network down/i,
  );
});

test("foreground sync revokes an exact cached Piece without deleting child bytes", async () => {
  const repository =
    await seededPieceRepository();

  const coordinator =
    createForegroundSyncCoordinator({
      offlineRepository:
        repository,
      publicationStatusService: {
        async getPublicationStatus() {
          throw new Error("unused");
        },
      },
      secureDeliveryStatusService: {
        async getAccessStatus() {
          throw new Error("unused");
        },
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
      },
      clock: () =>
        "2026-09-24T09:00:00Z",
    });

  const result =
    await coordinator.sync({
      session,
    });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNCED,
    checked: 1,
    revoked: 1,
    failed: 0,
  });
  assert.equal(
    await repository
      .getActivePieceManifest({
        studentId: "student-a",
        pieceAssignmentId:
          "piece-a",
      }),
    null,
  );
});

test("transient Piece status failure keeps cached Piece ACTIVE and reports sync error", async () => {
  const repository =
    await seededPieceRepository();

  const coordinator =
    createForegroundSyncCoordinator({
      offlineRepository:
        repository,
      publicationStatusService: {
        async getPublicationStatus() {
          throw new Error("unused");
        },
      },
      secureDeliveryStatusService: {
        async getAccessStatus() {
          throw new Error("unused");
        },
        async getPieceStatus() {
          throw new Error(
            "temporary network failure",
          );
        },
      },
      clock: () =>
        "2026-09-24T09:00:00Z",
    });

  const result =
    await coordinator.sync({
      session,
    });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNC_ERROR,
    checked: 1,
    revoked: 0,
    failed: 1,
  });

  const active =
    await repository
      .getActivePieceManifest({
        studentId: "student-a",
        pieceAssignmentId:
          "piece-a",
      });

  assert.notEqual(active, null);
  assert.equal(
    active.lastVerifiedAt,
    "2026-09-24T08:30:00Z",
  );
  assert.equal(
    JSON.stringify(result).includes(
      "temporary network failure",
    ),
    false,
  );
});

test("ACTIVE Piece status refreshes lifecycle metadata without changing authority identity", async () => {
  const repository =
    await seededPieceRepository();

  const coordinator =
    createForegroundSyncCoordinator({
      offlineRepository:
        repository,
      publicationStatusService: {
        async getPublicationStatus() {
          throw new Error("unused");
        },
      },
      secureDeliveryStatusService: {
        async getAccessStatus() {
          throw new Error("unused");
        },
        async getPieceStatus() {
          return {
            state: "ACTIVE",
            piece: pieceManifest({
              state: "COMPLETED",
            }),
          };
        },
      },
      clock: () =>
        "2026-09-24T09:00:00Z",
    });

  const result =
    await coordinator.sync({
      session,
    });

  assert.equal(
    result.state,
    SYNC_STATES.SYNCED,
  );
  assert.equal(
    result.checked,
    1,
  );

  const active =
    await repository
      .getActivePieceManifest({
        studentId: "student-a",
        pieceAssignmentId:
          "piece-a",
      });

  assert.equal(
    active.piece.state,
    "COMPLETED",
  );
  assert.equal(
    active.piece.pieceId,
    "work-a",
  );
  assert.equal(
    active.lastVerifiedAt,
    "2026-09-24T09:00:00Z",
  );
});


function scorePracticeItem(
  assignmentId = "assignment-score-a",
) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    practiceType: PRACTICE_TYPES.SCORE,
    package: makeApprovedPracticePackage({
      packageId: "pkg-score-a",
      scope: "student_private",
      recipientStudentId:
        "server-student-a",
    }),
  });
}

function offlineOnlyReadService(
  repository,
) {
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

async function seedOfflinePiece({
  score = false,
  chord = false,
  scoreAssignmentId =
    "assignment-score-a",
  chordAssignmentIds = [
    "assignment-chord-a",
  ],
} = {}) {
  const repository =
    createInMemoryOfflineRepository();
  await repository.putPieceManifest({
    studentId: "student-a",
    piece: pieceManifest({
      scoreAssignmentId,
      chordAssignmentIds,
    }),
    cachedAt:
      "2026-09-24T08:30:00Z",
    lastVerifiedAt:
      "2026-09-24T08:30:00Z",
  });

  if (score) {
    await repository.putAuthorized({
      studentId: "student-a",
      practiceItem:
        scorePracticeItem(
          scoreAssignmentId,
        ),
      cachedAt:
        "2026-09-24T08:30:00Z",
      lastVerifiedAt:
        "2026-09-24T08:30:00Z",
    });
  }

  if (chord) {
    for (
      const assignmentId of
      chordAssignmentIds
    ) {
      await repository.putAuthorized({
        studentId: "student-a",
        practiceItem:
          makeChordBoardPracticeItem({
            assignmentId,
          }),
        cachedAt:
          "2026-09-24T08:30:00Z",
        lastVerifiedAt:
          "2026-09-24T08:30:00Z",
      });
    }
  }

  return {
    repository,
    service:
      offlineOnlyReadService(
        repository,
      ),
  };
}

test("warm offline Piece with SCORE cache keeps Nota usable when chords are absent", async () => {
  const { service } =
    await seedOfflinePiece({
      score: true,
      chord: false,
    });

  const score =
    await service.getPieceScoreItem({
      session,
      pieceAssignmentId: "piece-a",
    });

  assert.equal(
    score.practiceType,
    PRACTICE_TYPES.SCORE,
  );
  await assert.rejects(
    () =>
      service.listPieceChordItems({
        session,
        pieceAssignmentId:
          "piece-a",
      }),
    /offline practice unavailable/i,
  );
});

test("warm offline Piece with chord cache keeps Akorlar usable without SCORE", async () => {
  const { service } =
    await seedOfflinePiece({
      score: false,
      chord: true,
      scoreAssignmentId: null,
    });

  const chords =
    await service.listPieceChordItems({
      session,
      pieceAssignmentId: "piece-a",
    });

  assert.equal(chords.length, 1);
  assert.equal(
    chords[0].practiceType,
    PRACTICE_TYPES.CHORD_BOARD,
  );
  await assert.rejects(
    () =>
      service.getPieceScoreItem({
        session,
        pieceAssignmentId:
          "piece-a",
      }),
    /piece score unavailable/i,
  );
});

test("warm offline Piece with both child caches exposes both authorized views", async () => {
  const { service } =
    await seedOfflinePiece({
      score: true,
      chord: true,
    });

  const [score, chords] =
    await Promise.all([
      service.getPieceScoreItem({
        session,
        pieceAssignmentId:
          "piece-a",
      }),
      service.listPieceChordItems({
        session,
        pieceAssignmentId:
          "piece-a",
      }),
    ]);

  assert.equal(
    score.practiceType,
    PRACTICE_TYPES.SCORE,
  );
  assert.equal(chords.length, 1);
});

test("cached Piece with zero usable child caches fails boundedly per view", async () => {
  const { service } =
    await seedOfflinePiece();

  await assert.rejects(
    () =>
      service.getPieceScoreItem({
        session,
        pieceAssignmentId:
          "piece-a",
      }),
    /offline practice unavailable/i,
  );
  await assert.rejects(
    () =>
      service.listPieceChordItems({
        session,
        pieceAssignmentId:
          "piece-a",
      }),
    /offline practice unavailable/i,
  );
});
