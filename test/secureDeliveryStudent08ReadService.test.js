import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  createSecureDeliveryStudent08ReadService,
} from "../src/sharing/secureDeliveryStudent08ReadService.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";
import {
  makeChordBoardRow,
} from "./support/chordBoardFixtures.js";

const studentA = createStudentSession({
  studentId: "firebase-uid-a",
});

function assignmentRow(
  assignmentId = "assignment-a",
  state = "ACTIVE",
) {
  return {
    deliveryId: assignmentId,
    assignmentId,
    packageId: `pkg-${assignmentId}`,
    practiceType: "SCORE",
    teacherNote: "Yavaş çalış.",
    state,
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeApprovedPracticePackage({
      packageId: `pkg-${assignmentId}`,
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  };
}

test("Secure Delivery Student08ReadPort maps sanitized Pool and lifecycle folders", async () => {
  const calls = [];
  const service = createSecureDeliveryStudent08ReadService({
    apiClient: {
      async listStudentPool() {
        calls.push(["pool"]);
        return [{
          poolItemId: "pool-a",
          title: "Duyuru",
          shortDescription: "",
          detailText: "Detay",
          publishedAt: "2026-09-23T10:00:00Z",
          audienceMode: "SELECTED",
        }];
      },
      async listStudentAssignments() {
        calls.push(["assignments"]);
        return [
          assignmentRow("assignment-a", "ACTIVE"),
          assignmentRow("assignment-b", "COMPLETED"),
        ];
      },
      async getStudentAssignment(deliveryId) {
        calls.push(["assignment", deliveryId]);
        return assignmentRow(deliveryId, "ACTIVE");
      },
    },
  });

  const pool = await service.listPoolItems({
    session: studentA,
  });
  assert.equal(pool[0].poolItemId, "pool-a");
  assert.equal("recipientStudentIds" in pool[0], false);

  const completed = await service.listAssignments({
    session: studentA,
    state: "COMPLETED",
  });
  assert.deepEqual(
    completed.map((item) => item.assignmentId),
    ["assignment-b"],
  );

  const practice =
    await service.getScorePracticeItem({
      session: studentA,
      assignmentId: "assignment-a",
    });
  assert.deepEqual(practice.accessRef, {
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  });
  assert.equal("publication" in practice, false);
  assert.equal(
    practice.package.packageId,
    "pkg-assignment-a",
  );
});

test("Secure Delivery Student08ReadPort rejects duplicate authority rows", async () => {
  const duplicatePool = createSecureDeliveryStudent08ReadService({
    apiClient: {
      async listStudentPool() {
        const row = {
          poolItemId: "pool-a",
          title: "Duyuru",
          shortDescription: "",
          detailText: "",
          publishedAt: "2026-09-23T10:00:00Z",
          audienceMode: "ALL",
        };
        return [row, row];
      },
      async listStudentAssignments() {
        return [];
      },
      async getStudentAssignment() {
        return assignmentRow();
      },
    },
  });

  await assert.rejects(
    () => duplicatePool.listPoolItems({ session: studentA }),
    /duplicate.*Pool/i,
  );

  const duplicateAssignments =
    createSecureDeliveryStudent08ReadService({
      apiClient: {
        async listStudentPool() {
          return [];
        },
        async listStudentAssignments() {
          return [
            assignmentRow("assignment-a"),
            assignmentRow("assignment-a"),
          ];
        },
        async getStudentAssignment() {
          return assignmentRow();
        },
      },
    });

  await assert.rejects(
    () =>
      duplicateAssignments.listAssignments({
        session: studentA,
      }),
    /duplicate.*assignment/i,
  );
});

test("Secure Delivery Student08ReadPort fails closed on exact assignment mismatch", async () => {
  const service = createSecureDeliveryStudent08ReadService({
    apiClient: {
      async listStudentPool() {
        return [];
      },
      async listStudentAssignments() {
        return [];
      },
      async getStudentAssignment() {
        return assignmentRow("assignment-other");
      },
    },
  });

  await assert.rejects(
    () =>
      service.getAssignment({
        session: studentA,
        assignmentId: "assignment-a",
      }),
    /identity mismatch/i,
  );

  await assert.rejects(
    () =>
      service.listAssignments({
        session: studentA,
        state: "UNKNOWN",
      }),
    /state filter/i,
  );
});


function pieceManifest({
  pieceAssignmentId = "piece-a",
  pieceId = "work-a",
  arrangementId = "arr-a",
  title = "Cambaz",
  state = "ACTIVE",
  scoreAssignmentId = "assignment-score-a",
  chordAssignmentIds = [
    "assignment-chord-a",
    "assignment-chord-b",
  ],
} = {}) {
  return {
    schemaVersion: "1.0.0",
    pieceAssignmentId,
    pieceId,
    arrangementId,
    title,
    teacherNote: "Parçayı yavaş çalış.",
    state,
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: {
      scoreAssignmentId,
      chordAssignmentIds,
    },
  };
}

function scorePieceRow(
  assignmentId = "assignment-score-a",
) {
  return assignmentRow(
    assignmentId,
    "ACTIVE",
  );
}

test("Piece list preserves same-title authority identities and state filter", async () => {
  const service =
    createSecureDeliveryStudent08ReadService({
      apiClient: {
        async listStudentPool() {
          return [];
        },
        async listStudentAssignments() {
          return [];
        },
        async getStudentAssignment(id) {
          return scorePieceRow(id);
        },
        async listStudentPieces() {
          return [
            pieceManifest(),
            pieceManifest({
              pieceAssignmentId: "piece-b",
              pieceId: "work-b",
              arrangementId: "arr-b",
              title: "Cambaz",
              state: "COMPLETED",
              scoreAssignmentId: "assignment-score-b",
              chordAssignmentIds: [],
            }),
          ];
        },
        async getStudentPiece(id) {
          return pieceManifest({
            pieceAssignmentId: id,
          });
        },
      },
    });

  const active = await service.listPieces({
    session: studentA,
    state: "ACTIVE",
  });
  assert.deepEqual(
    active.map((piece) => [
      piece.pieceAssignmentId,
      piece.pieceId,
      piece.title,
    ]),
    [["piece-a", "work-a", "Cambaz"]],
  );

  const all = await service.listPieces({
    session: studentA,
  });
  assert.equal(all.length, 2);
  assert.notEqual(all[0].pieceId, all[1].pieceId);
});

test("Piece SCORE and chord reads resolve only exact manifest child IDs", async () => {
  const calls = [];
  const manifest = pieceManifest();
  const service =
    createSecureDeliveryStudent08ReadService({
      apiClient: {
        async listStudentPool() {
          return [];
        },
        async listStudentAssignments() {
          return [];
        },
        async listStudentPieces() {
          return [manifest];
        },
        async getStudentPiece(id) {
          calls.push(["piece", id]);
          return manifest;
        },
        async getStudentAssignment(id) {
          calls.push(["assignment", id]);
          if (id === "assignment-score-a") {
            return scorePieceRow(id);
          }
          return makeChordBoardRow({
            assignmentId: id,
          });
        },
      },
    });

  const score =
    await service.getPieceScoreItem({
      session: studentA,
      pieceAssignmentId: "piece-a",
    });
  assert.equal(
    score.accessRef.deliveryId,
    "assignment-score-a",
  );

  const chords =
    await service.listPieceChordItems({
      session: studentA,
      pieceAssignmentId: "piece-a",
    });
  assert.deepEqual(
    chords.map(
      (item) => item.accessRef.deliveryId,
    ),
    [
      "assignment-chord-a",
      "assignment-chord-b",
    ],
  );

  assert.deepEqual(calls, [
    ["piece", "piece-a"],
    ["assignment", "assignment-score-a"],
    ["piece", "piece-a"],
    ["assignment", "assignment-chord-a"],
    ["assignment", "assignment-chord-b"],
  ]);
});

test("Piece exact read fails closed on manifest identity mismatch and wrong child type", async () => {
  const mismatch =
    createSecureDeliveryStudent08ReadService({
      apiClient: {
        async listStudentPool() {
          return [];
        },
        async listStudentAssignments() {
          return [];
        },
        async getStudentAssignment(id) {
          return scorePieceRow(id);
        },
        async listStudentPieces() {
          return [];
        },
        async getStudentPiece() {
          return pieceManifest({
            pieceAssignmentId:
              "piece-other",
          });
        },
      },
    });

  await assert.rejects(
    () =>
      mismatch.getPiece({
        session: studentA,
        pieceAssignmentId: "piece-a",
      }),
    /identity mismatch/i,
  );

  const wrongType =
    createSecureDeliveryStudent08ReadService({
      apiClient: {
        async listStudentPool() {
          return [];
        },
        async listStudentAssignments() {
          return [];
        },
        async listStudentPieces() {
          return [];
        },
        async getStudentPiece() {
          return pieceManifest();
        },
        async getStudentAssignment(id) {
          return scorePieceRow(id);
        },
      },
    });

  await assert.rejects(
    () =>
      wrongType.listPieceChordItems({
        session: studentA,
        pieceAssignmentId: "piece-a",
      }),
    /assignment type unavailable/i,
  );
});
