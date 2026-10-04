import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";

const session = createStudentSession({
  studentId: "student-a",
});

function legacySharing() {
  return {
    listPublicPool() {
      return [];
    },
    listMyWork() {
      return [];
    },
    getPracticeItem() {
      throw new Error("unused");
    },
  };
}

function pieceManifest({
  state = "ACTIVE",
  chordAssignmentIds = [
    "assignment-chord-a",
    "assignment-chord-b",
  ],
} = {}) {
  return Object.freeze({
    schemaVersion: "1.0.0",
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "Parçayı yavaş çalış.",
    state,
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: Object.freeze({
      scoreAssignmentId: "assignment-score-a",
      chordAssignmentIds: Object.freeze([
        ...chordAssignmentIds,
      ]),
    }),
  });
}

function assignment({
  assignmentId,
  practiceType,
  title,
  state,
}) {
  return Object.freeze({
    assignmentId,
    practiceType,
    title,
    teacherNote: "",
    state,
    assignedAt: "2026-09-24T08:00:00Z",
  });
}

function assignmentsFor(state) {
  return [
    assignment({
      assignmentId: "assignment-score-a",
      practiceType: "SCORE",
      title: "Cambaz Nota",
      state,
    }),
    assignment({
      assignmentId: "assignment-chord-a",
      practiceType: "CHORD_BOARD",
      title: "Am",
      state,
    }),
    assignment({
      assignmentId: "assignment-chord-b",
      practiceType: "CHORD_BOARD",
      title: "E7",
      state,
    }),
  ];
}

function makeService({
  initialState = "ACTIVE",
  duplicateChordRef = false,
  includeLegacy = false,
} = {}) {
  let currentState = initialState;

  const service = {
    listPoolItems() {
      return [];
    },
    getPoolItem() {
      throw new Error("unused");
    },
    listAssignments({ state }) {
      const rows = assignmentsFor(state);
      if (includeLegacy && state === "ACTIVE") {
        rows.push(
          assignment({
            assignmentId: "legacy-score",
            practiceType: "SCORE",
            title: "Eski Etüt",
            state,
          }),
        );
      }
      return rows;
    },
    getAssignment() {
      throw new Error("unused");
    },
    getScorePracticeItem() {
      throw new Error("unused");
    },
    getChordBoardPracticeItem() {
      throw new Error("unused");
    },
    listPieces({ state }) {
      if (state !== currentState) {
        return [];
      }
      return [
        pieceManifest({
          state: currentState,
          chordAssignmentIds:
            duplicateChordRef
              ? [
                  "assignment-chord-a",
                  "assignment-chord-a",
                  "assignment-chord-b",
                ]
              : undefined,
        }),
      ];
    },
    getPiece() {
      throw new Error("unused");
    },
    getPieceScoreItem() {
      throw new Error("unused");
    },
    listPieceChordItems() {
      throw new Error("unused");
    },
  };

  return {
    service,
    setState(nextState) {
      currentState = nextState;
    },
  };
}

function makeController(service) {
  return createStudentAppController({
    sharingService: legacySharing(),
    student08ReadService: service,
    initialSession: session,
  });
}

test("SES-157 ACTIVE Piece suppresses SCORE and chord children from legacy work rows", async () => {
  const { service } = makeService({
    includeLegacy: true,
  });
  const controller = makeController(service);

  await controller.showMyWork("ACTIVE");
  const state = controller.getState();

  assert.equal(
    state.screen,
    STUDENT_APP_SCREENS.MY_WORK,
  );
  assert.equal(state.assignmentState, "ACTIVE");

  const pieces = state.items.filter(
    (item) => item.itemKind === "PIECE",
  );
  assert.equal(pieces.length, 1);
  assert.equal(
    pieces[0].pieceAssignmentId,
    "piece-a",
  );

  for (const childId of [
    "assignment-score-a",
    "assignment-chord-a",
    "assignment-chord-b",
  ]) {
    assert.equal(
      state.items.some(
        (item) => item.assignmentId === childId,
      ),
      false,
    );
  }

  assert.equal(
    state.items.some(
      (item) =>
        item.assignmentId === "legacy-score",
    ),
    true,
  );
});

for (const lifecycleState of [
  "COMPLETED",
  "REPERTOIRE",
]) {
  test(`SES-157 ${lifecycleState} keeps one Piece identity and hides child assignments`, async () => {
    const { service } = makeService({
      initialState: lifecycleState,
    });
    const controller = makeController(service);

    await controller.showMyWork(
      lifecycleState,
    );
    const state = controller.getState();

    assert.equal(state.items.length, 1);
    assert.equal(
      state.items[0].itemKind,
      "PIECE",
    );
    assert.equal(
      state.items[0].pieceAssignmentId,
      "piece-a",
    );
    assert.equal(
      state.items[0].pieceId,
      "work-a",
    );
    assert.equal(
      state.items[0].teacherNote,
      "Parçayı yavaş çalış.",
    );
  });
}

test("SES-157 ACTIVE to REPERTOIRE moves the same Piece without leaving an ACTIVE duplicate", async () => {
  const fixture = makeService();
  const controller = makeController(
    fixture.service,
  );

  await controller.showMyWork("ACTIVE");
  assert.equal(
    controller.getState().items[0]
      .pieceAssignmentId,
    "piece-a",
  );

  fixture.setState("REPERTOIRE");

  await controller.showMyWork("ACTIVE");
  assert.equal(
    controller.getState().items.some(
      (item) => item.itemKind === "PIECE",
    ),
    false,
  );

  await controller.showMyWork(
    "REPERTOIRE",
  );
  const repertoirePiece =
    controller.getState().items.find(
      (item) => item.itemKind === "PIECE",
    );

  assert.equal(
    repertoirePiece.pieceAssignmentId,
    "piece-a",
  );
  assert.equal(
    repertoirePiece.pieceId,
    "work-a",
  );
});

test("SES-157 duplicate chord authority reference cannot create duplicate student rows", async () => {
  const { service } = makeService({
    duplicateChordRef: true,
  });
  const controller = makeController(service);

  await controller.showMyWork("ACTIVE");
  const state = controller.getState();

  assert.equal(
    state.items.filter(
      (item) => item.itemKind === "PIECE",
    ).length,
    1,
  );
  assert.equal(
    state.items.some(
      (item) =>
        item.assignmentId ===
        "assignment-chord-a",
    ),
    false,
  );
}