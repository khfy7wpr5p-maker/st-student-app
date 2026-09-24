import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";
import {
  makeChordBoardPracticeItem,
} from "./support/chordBoardFixtures.js";

const studentA = createStudentSession({
  studentId: "student-a",
});
const studentB = createStudentSession({
  studentId: "student-b",
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
  pieceAssignmentId = "piece-a",
  pieceId = "work-a",
  arrangementId = "arr-a",
  title = "Cambaz",
  scoreAssignmentId = "assignment-score-a",
  chordAssignmentIds = ["assignment-chord-a"],
} = {}) {
  return Object.freeze({
    schemaVersion: "1.0.0",
    pieceAssignmentId,
    pieceId,
    arrangementId,
    title,
    teacherNote: "Parçayı yavaş çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: Object.freeze({
      scoreAssignmentId,
      chordAssignmentIds: Object.freeze([
        ...chordAssignmentIds,
      ]),
    }),
  });
}

function scoreItem() {
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

function makeService({
  score = scoreItem(),
  chords = [
    makeChordBoardPracticeItem({
      assignmentId: "assignment-chord-a",
    }),
  ],
} = {}) {
  const calls = [];
  return {
    calls,
    service: {
      listPoolItems() {
        return [];
      },
      getPoolItem() {
        throw new Error("unused");
      },
      listAssignments() {
        return [];
      },
      getAssignment() {
        throw new Error("unused");
      },
      getScorePracticeItem() {
        throw new Error("legacy SCORE path unused");
      },
      getChordBoardPracticeItem() {
        throw new Error("legacy chord path unused");
      },
      listPieces() {
        calls.push(["listPieces"]);
        return [pieceManifest()];
      },
      getPiece({ pieceAssignmentId }) {
        calls.push(["getPiece", pieceAssignmentId]);
        return pieceManifest({
          pieceAssignmentId,
        });
      },
      getPieceScoreItem({ pieceAssignmentId }) {
        calls.push([
          "getPieceScoreItem",
          pieceAssignmentId,
        ]);
        if (score instanceof Error) {
          throw score;
        }
        return score;
      },
      listPieceChordItems({ pieceAssignmentId }) {
        calls.push([
          "listPieceChordItems",
          pieceAssignmentId,
        ]);
        if (chords instanceof Error) {
          throw chords;
        }
        return chords;
      },
    },
  };
}

test("Piece opens one workspace with SCORE default and return context", async () => {
  const { service } = makeService();
  const playbackCalls = [];
  const controller =
    createStudentAppController({
      sharingService: legacySharing(),
      student08ReadService: service,
      initialSession: studentA,
      notationAdapter: {
        isAvailable: () => true,
      },
      playbackPort: {
        preparePackage() {
          return true;
        },
        canPlayPackage() {
          return true;
        },
        canChangeTempoForPackage() {
          return false;
        },
        canRepeatMeasureForPackage() {
          return false;
        },
        pausePackage(pkg) {
          playbackCalls.push([
            "pause",
            pkg.packageId,
          ]);
        },
        disposePackage(pkg) {
          playbackCalls.push([
            "dispose",
            pkg.packageId,
          ]);
        },
      },
    });

  await controller.openPiece(
    "piece-a",
    {
      folderState: "ACTIVE",
      scrollPosition: 420,
    },
  );

  const state = controller.getState();
  assert.equal(
    state.screen,
    STUDENT_APP_SCREENS.PIECE_WORKSPACE,
  );
  assert.equal(
    state.pieceWorkspace.title,
    "Cambaz",
  );
  assert.equal(
    state.pieceWorkspace.selectedView,
    "SCORE",
  );
  assert.deepEqual(
    state.pieceWorkspace.availableViews,
    {
      score: true,
      chords: true,
    },
  );
  assert.equal(
    state.pieceWorkspace.chords.items.length,
    1,
  );

  controller.selectPieceView("CHORDS");
  assert.equal(
    controller.getState().pieceWorkspace.selectedView,
    "CHORDS",
  );
  assert.deepEqual(
    playbackCalls,
    [["pause", "pkg-score-a"]],
  );

  controller.selectPieceView("SCORE");
  assert.equal(
    controller.getState().pieceWorkspace.selectedView,
    "SCORE",
  );
  assert.equal(
    playbackCalls.some(([name]) => name === "dispose"),
    false,
  );

  controller.backFromPiece();
  const returned = controller.getState();
  assert.equal(
    returned.screen,
    STUDENT_APP_SCREENS.MY_WORK,
  );
  assert.equal(
    returned.assignmentState,
    "ACTIVE",
  );
  assert.deepEqual(
    returned.returnContext,
    {
      folderState: "ACTIVE",
      scrollPosition: 420,
    },
  );
});

test("Piece child failure is isolated and default view uses remaining content", async () => {
  const { service } = makeService({
    score: new Error("score unavailable"),
  });
  const controller =
    createStudentAppController({
      sharingService: legacySharing(),
      student08ReadService: service,
      initialSession: studentA,
    });

  await controller.openPiece("piece-a", {
    folderState: "ACTIVE",
    scrollPosition: 0,
  });

  const workspace =
    controller.getState().pieceWorkspace;
  assert.equal(
    workspace.availableViews.score,
    false,
  );
  assert.equal(
    workspace.availableViews.chords,
    true,
  );
  assert.equal(
    workspace.selectedView,
    "CHORDS",
  );
});

test("Piece open fails boundedly when every child view is unavailable", async () => {
  const { service } = makeService({
    score: new Error("score unavailable"),
    chords: new Error("chords unavailable"),
  });
  const controller =
    createStudentAppController({
      sharingService: legacySharing(),
      student08ReadService: service,
      initialSession: studentA,
    });

  await assert.rejects(
    () =>
      controller.openPiece(
        "piece-a",
        {
          folderState: "ACTIVE",
          scrollPosition: 0,
        },
      ),
    /Piece content unavailable/i,
  );
});

test("late Piece response from previous session is ignored and sign-out clears workspace", async () => {
  let resolvePiece;
  const pending = new Promise((resolve) => {
    resolvePiece = resolve;
  });
  const { service } = makeService();
  service.getPiece = () => pending;

  const controller =
    createStudentAppController({
      sharingService: legacySharing(),
      student08ReadService: service,
      initialSession: studentA,
    });

  const opening = controller.openPiece(
    "piece-a",
    {
      folderState: "ACTIVE",
      scrollPosition: 0,
    },
  );

  controller.attachSession(studentB);
  resolvePiece(pieceManifest());
  await opening;

  assert.equal(
    controller.getState().screen,
    STUDENT_APP_SCREENS.HOME,
  );
  assert.equal(
    controller.getState().session.studentId,
    "student-b",
  );
  assert.equal(
    controller.getState().pieceWorkspace ?? null,
    null,
  );

  controller.attachSession(studentA);
  await controller.openPiece(
    "piece-a",
    {
      folderState: "ACTIVE",
      scrollPosition: 0,
    },
  );
  controller.signOut();
  assert.equal(
    controller.getState().pieceWorkspace,
    null,
  );
});
