import {
  getAuthenticatedStudentId,
} from "../auth/session.js";
import {
  PRACTICE_TYPES,
} from "../contracts/privateAssignment.js";
import {
  CONNECTIVITY_STATES,
} from "./connectivityPort.js";

function requireStudentId(session) {
  const studentId =
    getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error(
      "authenticated student session required",
    );
  }

  return studentId;
}

function requiredAssignmentId(value) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      "assignmentId must be a non-empty string",
    );
  }

  return value.trim();
}


function requiredPieceAssignmentId(value) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      "pieceAssignmentId must be a non-empty string",
    );
  }

  return value.trim();
}

function annotate(
  item,
  source,
  deviceAvailable,
  saveFailed = false,
) {
  return Object.freeze({
    ...item,
    offlineAvailability: Object.freeze({
      source,
      deviceAvailable,
      saveFailed,
    }),
  });
}

export function createSecureDeliveryOfflineReadService({
  onlineReadService,
  offlineRepository,
  connectivityPort,
  clock = () => new Date().toISOString(),
} = {}) {
  if (
    onlineReadService === null ||
    typeof onlineReadService !== "object" ||
    typeof onlineReadService.listPoolItems !== "function" ||
    typeof onlineReadService.getPoolItem !== "function" ||
    typeof onlineReadService.listAssignments !== "function" ||
    typeof onlineReadService.getAssignment !== "function" ||
    typeof onlineReadService.getScorePracticeItem !== "function" ||
    typeof onlineReadService.getChordBoardPracticeItem !== "function"
  ) {
    throw new TypeError(
      "onlineReadService is incomplete",
    );
  }

  if (
    offlineRepository === null ||
    typeof offlineRepository?.putAuthorized !== "function" ||
    typeof offlineRepository?.getActiveByAccessRef !== "function"
  ) {
    throw new TypeError(
      "offlineRepository is incomplete",
    );
  }

  if (
    connectivityPort === null ||
    typeof connectivityPort?.getState !== "function"
  ) {
    throw new TypeError(
      "connectivityPort is required",
    );
  }

  const assignmentViews = new Map();

  const isOffline = () =>
    connectivityPort.getState() ===
    CONNECTIVITY_STATES.OFFLINE;

  const assignmentKey = (
    studentId,
    assignmentId,
  ) =>
    `${studentId}\u0000${assignmentId}`;

  function cacheAssignment(
    studentId,
    item,
  ) {
    assignmentViews.set(
      assignmentKey(
        studentId,
        item.assignmentId,
      ),
      item,
    );
    return item;
  }

  function cachedAssignmentsForStudent(
    studentId,
  ) {
    const prefix =
      `${studentId}\u0000`;

    return [
      ...assignmentViews.entries(),
    ]
      .filter(([key]) =>
        key.startsWith(prefix),
      )
      .map(([, item]) => item);
  }

  async function listAssignments({
    session,
    state,
  } = {}) {
    const studentId =
      requireStudentId(session);

    if (isOffline()) {
      return Object.freeze(
        cachedAssignmentsForStudent(
          studentId,
        ).filter(
          (item) =>
            state === undefined ||
            item.state === state,
        ),
      );
    }

    const items =
      await onlineReadService.listAssignments({
        session,
        state,
      });

    if (!Array.isArray(items)) {
      throw new TypeError(
        "student assignment response must be an array",
      );
    }

    for (const item of items) {
      cacheAssignment(
        studentId,
        item,
      );
    }

    return items;
  }

  async function getAssignment({
    session,
    assignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredAssignmentId(
        assignmentId,
      );

    if (isOffline()) {
      const cached =
        assignmentViews.get(
          assignmentKey(
            studentId,
            id,
          ),
        ) ?? null;

      if (cached === null) {
        throw new Error(
          "offline assignment metadata unavailable",
        );
      }

      return cached;
    }

    const item =
      await onlineReadService.getAssignment({
        session,
        assignmentId: id,
      });

    if (
      item?.assignmentId !== id
    ) {
      throw new Error(
        "assignment identity mismatch",
      );
    }

    return cacheAssignment(
      studentId,
      item,
    );
  }

  async function getPrivatePracticeItem({
    session,
    assignmentId,
    expectedPracticeType,
    onlineMethod,
  }) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredAssignmentId(
        assignmentId,
      );
    const accessRef =
      Object.freeze({
        kind: "SECURE_DELIVERY",
        deliveryId: id,
      });

    if (isOffline()) {
      const record =
        await offlineRepository
          .getActiveByAccessRef({
            studentId,
            accessRef,
          });

      if (
        record === null ||
        record.practiceType !==
          expectedPracticeType
      ) {
        throw new Error(
          "offline practice unavailable",
        );
      }

      return annotate(
        Object.freeze({
          accessRef:
            record.accessRef,
          practiceType:
            record.practiceType,
          package:
            record.package,
        }),
        "offline",
        true,
      );
    }

    const item =
      await onlineMethod({
        session,
        assignmentId: id,
      });

    if (
      item?.accessRef?.kind !==
        "SECURE_DELIVERY" ||
      item.accessRef.deliveryId !== id ||
      item.practiceType !==
        expectedPracticeType
    ) {
      throw new Error(
        "assignment identity mismatch",
      );
    }

    const now = clock();

    try {
      await offlineRepository
        .putAuthorized({
          studentId,
          practiceItem: item,
          cachedAt: now,
          lastVerifiedAt: now,
        });

      return annotate(
        item,
        "online",
        true,
      );
    } catch {
      return annotate(
        item,
        "online",
        false,
        true,
      );
    }
  }

  function getScorePracticeItem({
    session,
    assignmentId,
  } = {}) {
    return getPrivatePracticeItem({
      session,
      assignmentId,
      expectedPracticeType:
        PRACTICE_TYPES.SCORE,
      onlineMethod:
        onlineReadService
          .getScorePracticeItem,
    });
  }

  function getChordBoardPracticeItem({
    session,
    assignmentId,
  } = {}) {
    return getPrivatePracticeItem({
      session,
      assignmentId,
      expectedPracticeType:
        PRACTICE_TYPES.CHORD_BOARD,
      onlineMethod:
        onlineReadService
          .getChordBoardPracticeItem,
    });
  }


  function requirePieceRepository() {
    for (const method of [
      "putPieceManifest",
      "getActivePieceManifest",
      "listActivePieceManifests",
      "markPieceManifestRevoked",
    ]) {
      if (
        typeof offlineRepository?.[method] !==
        "function"
      ) {
        throw new TypeError(
          "offline Piece repository is incomplete",
        );
      }
    }
  }

  function requireOnlinePieceService() {
    for (const method of [
      "listPieces",
      "getPiece",
      "getPieceScoreItem",
      "listPieceChordItems",
    ]) {
      if (
        typeof onlineReadService?.[method] !==
        "function"
      ) {
        throw new TypeError(
          "online Piece read service is incomplete",
        );
      }
    }
  }

  async function cachePieceManifest(
    studentId,
    piece,
  ) {
    requirePieceRepository();
    const now = clock();
    return offlineRepository.putPieceManifest({
      studentId,
      piece,
      cachedAt: now,
      lastVerifiedAt: now,
    });
  }

  async function listPieces({
    session,
    state,
  } = {}) {
    const studentId =
      requireStudentId(session);
    requirePieceRepository();

    if (isOffline()) {
      const records =
        await offlineRepository
          .listActivePieceManifests({
            studentId,
            state,
          });
      return Object.freeze(
        records.map(
          (record) => record.piece,
        ),
      );
    }

    requireOnlinePieceService();
    const pieces =
      await onlineReadService.listPieces({
        session,
        state,
      });

    if (!Array.isArray(pieces)) {
      throw new TypeError(
        "student Piece response must be an array",
      );
    }

    for (const piece of pieces) {
      try {
        await cachePieceManifest(
          studentId,
          piece,
        );
      } catch {
        // Online authority remains usable if local persistence fails.
      }
    }

    return pieces;
  }

  async function getPiece({
    session,
    pieceAssignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredPieceAssignmentId(
        pieceAssignmentId,
      );
    requirePieceRepository();

    if (isOffline()) {
      const record =
        await offlineRepository
          .getActivePieceManifest({
            studentId,
            pieceAssignmentId: id,
          });

      if (record === null) {
        throw new Error(
          "offline Piece manifest unavailable",
        );
      }

      return record.piece;
    }

    requireOnlinePieceService();
    const piece =
      await onlineReadService.getPiece({
        session,
        pieceAssignmentId: id,
      });

    if (
      piece?.pieceAssignmentId !== id
    ) {
      throw new Error(
        "Piece identity mismatch",
      );
    }

    try {
      await cachePieceManifest(
        studentId,
        piece,
      );
    } catch {
      // Online authority remains usable if local persistence fails.
    }

    return piece;
  }

  async function cachedOrOnlinePiece({
    session,
    studentId,
    pieceAssignmentId,
  }) {
    requirePieceRepository();
    const cached =
      await offlineRepository
        .getActivePieceManifest({
          studentId,
          pieceAssignmentId,
        });

    if (cached !== null) {
      return cached.piece;
    }

    if (isOffline()) {
      throw new Error(
        "offline Piece manifest unavailable",
      );
    }

    return getPiece({
      session,
      pieceAssignmentId,
    });
  }

  async function cachePiecePracticeItem({
    studentId,
    item,
    expectedPracticeType,
    expectedAssignmentId,
  }) {
    if (
      item?.accessRef?.kind !==
        "SECURE_DELIVERY" ||
      item.accessRef.deliveryId !==
        expectedAssignmentId ||
      item.practiceType !==
        expectedPracticeType
    ) {
      throw new Error(
        "Piece child assignment identity mismatch",
      );
    }

    const now = clock();
    try {
      await offlineRepository
        .putAuthorized({
          studentId,
          practiceItem: item,
          cachedAt: now,
          lastVerifiedAt: now,
        });

      return annotate(
        item,
        "online",
        true,
      );
    } catch {
      return annotate(
        item,
        "online",
        false,
        true,
      );
    }
  }

  async function getPieceScoreItem({
    session,
    pieceAssignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredPieceAssignmentId(
        pieceAssignmentId,
      );
    const piece =
      await cachedOrOnlinePiece({
        session,
        studentId,
        pieceAssignmentId: id,
      });
    const assignmentId =
      piece.contentRefs
        .scoreAssignmentId;

    if (assignmentId === null) {
      throw new Error(
        "piece score unavailable",
      );
    }

    if (isOffline()) {
      return getScorePracticeItem({
        session,
        assignmentId,
      });
    }

    requireOnlinePieceService();
    const item =
      await onlineReadService
        .getPieceScoreItem({
          session,
          pieceAssignmentId: id,
        });

    return cachePiecePracticeItem({
      studentId,
      item,
      expectedPracticeType:
        PRACTICE_TYPES.SCORE,
      expectedAssignmentId:
        assignmentId,
    });
  }

  async function listPieceChordItems({
    session,
    pieceAssignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredPieceAssignmentId(
        pieceAssignmentId,
      );
    const piece =
      await cachedOrOnlinePiece({
        session,
        studentId,
        pieceAssignmentId: id,
      });
    const assignmentIds =
      piece.contentRefs
        .chordAssignmentIds;

    if (isOffline()) {
      const items = [];
      for (const assignmentId of assignmentIds) {
        items.push(
          await getChordBoardPracticeItem({
            session,
            assignmentId,
          }),
        );
      }
      return Object.freeze(items);
    }

    requireOnlinePieceService();
    const raw =
      await onlineReadService
        .listPieceChordItems({
          session,
          pieceAssignmentId: id,
        });

    if (
      !Array.isArray(raw) ||
      raw.length !==
        assignmentIds.length
    ) {
      throw new Error(
        "Piece chord authority mismatch",
      );
    }

    const items = [];
    for (
      let index = 0;
      index < raw.length;
      index += 1
    ) {
      items.push(
        await cachePiecePracticeItem({
          studentId,
          item: raw[index],
          expectedPracticeType:
            PRACTICE_TYPES.CHORD_BOARD,
          expectedAssignmentId:
            assignmentIds[index],
        }),
      );
    }

    return Object.freeze(items);
  }

  return Object.freeze({
    async listPoolItems({
      session,
    } = {}) {
      requireStudentId(session);

      if (isOffline()) {
        throw new Error(
          "Secure Delivery Pool unavailable offline",
        );
      }

      return onlineReadService
        .listPoolItems({
          session,
        });
    },

    async getPoolItem({
      session,
      poolItemId,
    } = {}) {
      requireStudentId(session);

      if (isOffline()) {
        throw new Error(
          "Secure Delivery Pool unavailable offline",
        );
      }

      return onlineReadService
        .getPoolItem({
          session,
          poolItemId,
        });
    },

    listAssignments,
    getAssignment,
    getScorePracticeItem,
    getChordBoardPracticeItem,
    listPieces,
    getPiece,
    getPieceScoreItem,
    listPieceChordItems,
  });
}
