import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
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

async function seedAuthorityGraph() {
  const repository =
    createInMemoryOfflineRepository();

  await repository.putPieceManifest({
    studentId: "student-a",
    piece: pieceManifest(),
    cachedAt,
    lastVerifiedAt: cachedAt,
  });

  for (const practiceItem of [
    scorePracticeItem(),
    makeChordBoardPracticeItem({
      assignmentId: "assignment-chord-a",
    }),
    makeChordBoardPracticeItem({
      assignmentId: "assignment-chord-b",
    }),
  ]) {
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

test("SES-157 successful reconnect revoke disables Piece and every cached child authority", async () => {
  const repository =
    await seedAuthorityGraph();

  const coordinator =
    createForegroundSyncCoordinator({
      offlineRepository: repository,
      publicationStatusService: {
        async getPublicationStatus() {
          throw new Error("unused");
        },
      },
      secureDeliveryStatusService: {
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
      clock: () => verifiedAt,
    });

  const result = await coordinator.sync({
    session,
  });

  assert.deepEqual(result, {
    state: SYNC_STATES.SYNCED,
    checked: 4,
    revoked: 1,
    failed: 0,
  });
  assert.equal(
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
});