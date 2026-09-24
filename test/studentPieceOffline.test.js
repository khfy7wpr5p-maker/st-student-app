import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
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

const session = createStudentSession({
  studentId: "student-a",
});

function pieceManifest({
  state = "ACTIVE",
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
      scoreAssignmentId: "assignment-score-a",
      chordAssignmentIds: [
        "assignment-chord-a",
      ],
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
