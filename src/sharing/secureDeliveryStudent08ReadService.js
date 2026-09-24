import {
  getAuthenticatedStudentId,
} from "../auth/session.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../contracts/privateAssignment.js";
import {
  createStudentPoolView,
} from "../contracts/studentPoolView.js";
import {
  createStudentPieceManifest,
} from "../contracts/pieceAssignment.js";
import {
  createSecureDeliveryAssignmentRow,
  toStudentAssignmentView,
} from "../contracts/secureDeliveryAssignment.js";

function requireSession(session) {
  if (getAuthenticatedStudentId(session) === null) {
    throw new Error("unauthenticated");
  }
}

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function uniqueById(rows, key, label) {
  const seen = new Set();

  for (const row of rows) {
    if (seen.has(row[key])) {
      throw new Error(`duplicate ${label} authority`);
    }
    seen.add(row[key]);
  }

  return rows;
}

export function createSecureDeliveryStudent08ReadService({
  apiClient,
} = {}) {
  if (
    typeof apiClient?.listStudentPool !== "function" ||
    typeof apiClient?.listStudentAssignments !== "function" ||
    typeof apiClient?.getStudentAssignment !== "function"
  ) {
    throw new TypeError(
      "Secure Delivery API client is incomplete",
    );
  }

  async function listPoolItems({ session } = {}) {
    requireSession(session);
    const raw = await apiClient.listStudentPool();
    if (!Array.isArray(raw)) {
      throw new TypeError(
        "student Pool response must be an array",
      );
    }

    return Object.freeze(
      uniqueById(
        raw.map(createStudentPoolView),
        "poolItemId",
        "Pool",
      ),
    );
  }

  async function getPoolItem({
    session,
    poolItemId,
  } = {}) {
    const id = requiredText(
      poolItemId,
      "poolItemId",
    );
    const items = await listPoolItems({ session });
    const item =
      items.find(
        (candidate) =>
          candidate.poolItemId === id,
      ) ?? null;

    if (item === null) {
      throw new Error("pool item not found");
    }

    return item;
  }

  async function normalizedAssignments(session) {
    requireSession(session);
    const raw =
      await apiClient.listStudentAssignments();

    if (!Array.isArray(raw)) {
      throw new TypeError(
        "student assignment response must be an array",
      );
    }

    return uniqueById(
      raw.map(createSecureDeliveryAssignmentRow),
      "assignmentId",
      "assignment",
    );
  }

  async function exactAssignment({
    session,
    assignmentId,
  } = {}) {
    requireSession(session);
    const id = requiredText(
      assignmentId,
      "assignmentId",
    );
    const row = createSecureDeliveryAssignmentRow(
      await apiClient.getStudentAssignment(id),
    );

    if (
      row.assignmentId !== id ||
      row.deliveryId !== id
    ) {
      throw new Error(
        "assignment identity mismatch",
      );
    }

    return row;
  }


  async function normalizedPieces(session) {
    requireSession(session);

    if (
      typeof apiClient.listStudentPieces !==
      "function"
    ) {
      throw new TypeError(
        "Secure Delivery Piece list API is unavailable",
      );
    }

    const raw =
      await apiClient.listStudentPieces();

    if (!Array.isArray(raw)) {
      throw new TypeError(
        "student Piece response must be an array",
      );
    }

    return uniqueById(
      raw.map(createStudentPieceManifest),
      "pieceAssignmentId",
      "Piece",
    );
  }

  async function exactPiece({
    session,
    pieceAssignmentId,
  } = {}) {
    requireSession(session);

    if (
      typeof apiClient.getStudentPiece !==
      "function"
    ) {
      throw new TypeError(
        "Secure Delivery Piece detail API is unavailable",
      );
    }

    const id = requiredText(
      pieceAssignmentId,
      "pieceAssignmentId",
    );
    const piece = createStudentPieceManifest(
      await apiClient.getStudentPiece(id),
    );

    if (piece.pieceAssignmentId !== id) {
      throw new Error(
        "Piece identity mismatch",
      );
    }

    return piece;
  }

  return Object.freeze({
    listPoolItems,
    getPoolItem,

    async listPieces({
      session,
      state,
    } = {}) {
      if (
        state !== undefined &&
        !Object.values(
          ASSIGNMENT_STATES,
        ).includes(state)
      ) {
        throw new TypeError(
          "Piece state filter is invalid",
        );
      }

      const pieces =
        await normalizedPieces(session);

      return Object.freeze(
        pieces.filter(
          (piece) =>
            state === undefined ||
            piece.state === state,
        ),
      );
    },

    async getPiece(args = {}) {
      return exactPiece(args);
    },

    async getPieceScoreItem({
      session,
      pieceAssignmentId,
    } = {}) {
      const piece = await exactPiece({
        session,
        pieceAssignmentId,
      });

      const assignmentId =
        piece.contentRefs
          .scoreAssignmentId;

      if (assignmentId === null) {
        throw new Error(
          "piece score unavailable",
        );
      }

      const row = await exactAssignment({
        session,
        assignmentId,
      });

      if (
        row.practiceType !==
        PRACTICE_TYPES.SCORE
      ) {
        throw new Error(
          "assignment type unavailable",
        );
      }

      return Object.freeze({
        accessRef: Object.freeze({
          kind: "SECURE_DELIVERY",
          deliveryId: row.deliveryId,
        }),
        practiceType:
          PRACTICE_TYPES.SCORE,
        package: row.package,
      });
    },

    async listPieceChordItems({
      session,
      pieceAssignmentId,
    } = {}) {
      const piece = await exactPiece({
        session,
        pieceAssignmentId,
      });

      const items = [];
      for (
        const assignmentId
        of piece.contentRefs
          .chordAssignmentIds
      ) {
        const row = await exactAssignment({
          session,
          assignmentId,
        });

        if (
          row.practiceType !==
          PRACTICE_TYPES.CHORD_BOARD
        ) {
          throw new Error(
            "assignment type unavailable",
          );
        }

        items.push(
          Object.freeze({
            accessRef: Object.freeze({
              kind: "SECURE_DELIVERY",
              deliveryId:
                row.deliveryId,
            }),
            practiceType:
              PRACTICE_TYPES.CHORD_BOARD,
            package: row.package,
          }),
        );
      }

      return Object.freeze(items);
    },

    async listAssignments({
      session,
      state,
    } = {}) {
      if (
        state !== undefined &&
        !Object.values(
          ASSIGNMENT_STATES,
        ).includes(state)
      ) {
        throw new TypeError(
          "assignment state filter is invalid",
        );
      }

      const rows =
        await normalizedAssignments(session);

      return Object.freeze(
        rows
          .filter(
            (row) =>
              state === undefined ||
              row.state === state,
          )
          .map(toStudentAssignmentView),
      );
    },

    async getAssignment(args = {}) {
      return toStudentAssignmentView(
        await exactAssignment(args),
      );
    },

    async getScorePracticeItem(args = {}) {
      const row =
        await exactAssignment(args);

      if (
        row.practiceType !==
        PRACTICE_TYPES.SCORE
      ) {
        throw new Error(
          "assignment type unavailable",
        );
      }

      return Object.freeze({
        accessRef: Object.freeze({
          kind: "SECURE_DELIVERY",
          deliveryId: row.deliveryId,
        }),
        practiceType: PRACTICE_TYPES.SCORE,
        package: row.package,
      });
    },

    async getChordBoardPracticeItem(
      args = {},
    ) {
      const row =
        await exactAssignment(args);

      if (
        row.practiceType !==
        PRACTICE_TYPES.CHORD_BOARD
      ) {
        throw new Error(
          "assignment type unavailable",
        );
      }

      return Object.freeze({
        accessRef: Object.freeze({
          kind: "SECURE_DELIVERY",
          deliveryId: row.deliveryId,
        }),
        practiceType:
          PRACTICE_TYPES.CHORD_BOARD,
        package: row.package,
      });
    },
  });
}
