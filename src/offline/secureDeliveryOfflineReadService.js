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
  });
}
