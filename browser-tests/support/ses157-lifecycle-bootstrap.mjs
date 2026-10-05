import {
  createStudentSession,
} from "../../src/auth/session.js";
import {
  createStudentAppController,
} from "../../src/ui/studentAppController.js";
import {
  mountStudentApp,
} from "../../src/ui/mountStudentApp.js";
import {
  SES13_STUDENT_A_PIECE_TITLE,
  createSes13OnlineReadService,
  ses13StudentAId,
} from "./student-app-e2e-fixtures.mjs";

const root =
  document.querySelector("#app");

if (root === null) {
  throw new Error(
    "SES-157 E2E app root missing",
  );
}

const baseService =
  createSes13OnlineReadService();
let pieceState = "ACTIVE";

const SCORE_ASSIGNMENT_ID =
  "ses13-score-assignment-a";
const CHORD_ASSIGNMENT_ID =
  "ses13-chord-assignment-a";
const PIECE_ASSIGNMENT_ID =
  "ses13-piece-assignment-a";

function assignmentRow({
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
    assignedAt:
      "2026-09-25T08:00:00.000Z",
  });
}

async function currentPiece(session) {
  const pieces =
    await baseService.listPieces({
      session,
    });
  const piece = pieces[0];

  if (piece === undefined) {
    throw new Error(
      "SES-157 fixture Piece missing",
    );
  }

  return Object.freeze({
    ...piece,
    state: pieceState,
  });
}

const student08ReadService =
  Object.freeze({
    listPoolItems:
      baseService.listPoolItems,
    getPoolItem:
      baseService.getPoolItem,

    async listAssignments({
      state,
    } = {}) {
      const rows = [];

      if (state === pieceState) {
        rows.push(
          assignmentRow({
            assignmentId:
              SCORE_ASSIGNMENT_ID,
            practiceType: "SCORE",
            title:
              "SES-157 SCORE child",
            state,
          }),
          assignmentRow({
            assignmentId:
              CHORD_ASSIGNMENT_ID,
            practiceType:
              "CHORD_BOARD",
            title:
              "SES-157 CHORD child",
            state,
          }),
        );
      }

      if (state === "ACTIVE") {
        rows.push(
          assignmentRow({
            assignmentId:
              "ses157-unrelated-score",
            practiceType: "SCORE",
            title: "Bağımsız Etüt",
            state,
          }),
        );
      }

      return Object.freeze(rows);
    },

    getAssignment:
      baseService.getAssignment,
    getScorePracticeItem:
      baseService.getScorePracticeItem,
    getChordBoardPracticeItem:
      baseService.getChordBoardPracticeItem,

    async listPieces({
      session,
      state,
    } = {}) {
      const piece =
        await currentPiece(session);

      return Object.freeze(
        state === undefined ||
        state === pieceState
          ? [piece]
          : [],
      );
    },

    async getPiece({
      session,
      pieceAssignmentId,
    } = {}) {
      if (
        pieceAssignmentId !==
        PIECE_ASSIGNMENT_ID
      ) {
        throw new Error(
          "SES-157 fixture Piece unavailable",
        );
      }

      return currentPiece(session);
    },

    getPieceScoreItem:
      baseService.getPieceScoreItem,
    listPieceChordItems:
      baseService.listPieceChordItems,
  });

const legacySharingBoundary =
  Object.freeze({
    listPublicPool() {
      throw new Error(
        "SES-157 legacy sharing boundary used",
      );
    },
    listMyWork() {
      throw new Error(
        "SES-157 legacy sharing boundary used",
      );
    },
    getPracticeItem() {
      throw new Error(
        "SES-157 legacy sharing boundary used",
      );
    },
  });

const session =
  createStudentSession({
    studentId: ses13StudentAId(),
  });

const controller =
  createStudentAppController({
    sharingService:
      legacySharingBoundary,
    student08ReadService,
    initialSession: session,
  });

mountStudentApp({
  root,
  controller,
});

globalThis.__ses157SetPieceState =
  (nextState) => {
    if (
      nextState !== "ACTIVE" &&
      nextState !== "REPERTOIRE"
    ) {
      throw new Error(
        "unsupported SES-157 fixture state",
      );
    }

    pieceState = nextState;
  };

globalThis.__ses157PieceTitle =
  SES13_STUDENT_A_PIECE_TITLE;

document.documentElement
  .setAttribute(
    "data-ses157-e2e-ready",
    "true",
  );