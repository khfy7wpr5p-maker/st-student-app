import { getAuthenticatedStudentId } from "../auth/session.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
  createPrivateAssignment,
} from "../contracts/privateAssignment.js";
import {
  canStudentReadPoolItem,
  createPoolItem,
  toStudentPoolItem,
} from "../contracts/poolItem.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function requireStudentId(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("unauthenticated");
  }

  return studentId;
}

function requireRepositoryMethod(repository, name, label) {
  if (typeof repository?.[name] !== "function") {
    throw new TypeError(`${label} repository requires ${name}`);
  }
}

function maybeResolve(value, onResolved) {
  if (value !== null && typeof value?.then === "function") {
    return Promise.resolve(value).then(onResolved);
  }

  return onResolved(value);
}

function normalizePoolList(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("pool repository list must be an array");
  }

  return value.map(createPoolItem);
}

function normalizeAssignmentList(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("assignment repository list must be an array");
  }

  return value.map(createPrivateAssignment);
}

function validateStateFilter(state) {
  if (
    state !== undefined &&
    !Object.values(ASSIGNMENT_STATES).includes(state)
  ) {
    throw new TypeError("assignment state filter is invalid");
  }
}

function studentAssignmentView(assignment) {
  const view = {
    assignmentId: assignment.assignmentId,
    practiceType: assignment.practiceType,
    teacherNote: assignment.teacherNote,
    state: assignment.state,
    assignedAt: assignment.assignedAt,
  };

  if (assignment.practiceType === PRACTICE_TYPES.SCORE) {
    view.sourceRef = assignment.sourceRef;
  } else {
    view.snapshot = assignment.snapshot;
  }

  return Object.freeze(view);
}

export function createStudent08ReadService({
  poolRepository,
  assignmentRepository,
  scoreSharingService = null,
} = {}) {
  requireRepositoryMethod(poolRepository, "list", "pool");
  requireRepositoryMethod(poolRepository, "getById", "pool");
  requireRepositoryMethod(
    assignmentRepository,
    "listForStudent",
    "assignment",
  );
  requireRepositoryMethod(
    assignmentRepository,
    "getById",
    "assignment",
  );

  function authorizedAssignment({
    session,
    assignmentId,
    allowRevoked = false,
  }) {
    const studentId = requireStudentId(session);

    if (!hasText(assignmentId)) {
      throw new TypeError("assignmentId must be a non-empty string");
    }

    const result = assignmentRepository.getById(assignmentId);

    return maybeResolve(result, (record) => {
      if (record === null || record === undefined) {
        throw new Error("assignment not found");
      }

      const assignment = createPrivateAssignment(record);

      if (assignment.studentId !== studentId) {
        throw new Error("forbidden");
      }

      if (!allowRevoked && assignment.revokedAt !== null) {
        throw new Error("assignment revoked");
      }

      return assignment;
    });
  }

  return Object.freeze({
    listPoolItems({ session }) {
      const studentId = requireStudentId(session);
      const result = poolRepository.list();

      return maybeResolve(result, (records) =>
        normalizePoolList(records)
          .filter((item) => canStudentReadPoolItem(item, studentId))
          .map(toStudentPoolItem),
      );
    },

    getPoolItem({ session, poolItemId }) {
      const studentId = requireStudentId(session);

      if (!hasText(poolItemId)) {
        throw new TypeError("poolItemId must be a non-empty string");
      }

      const result = poolRepository.getById(poolItemId);

      return maybeResolve(result, (record) => {
        if (record === null || record === undefined) {
          throw new Error("pool item not found");
        }

        const item = createPoolItem(record);

        if (!canStudentReadPoolItem(item, studentId)) {
          throw new Error("forbidden");
        }

        return toStudentPoolItem(item);
      });
    },

    listAssignments({ session, state } = {}) {
      const studentId = requireStudentId(session);
      validateStateFilter(state);
      const result = assignmentRepository.listForStudent(studentId);

      return maybeResolve(result, (records) =>
        normalizeAssignmentList(records)
          .map((assignment) => {
            if (assignment.studentId !== studentId) {
              throw new Error("forbidden");
            }

            return assignment;
          })
          .filter((assignment) => assignment.revokedAt === null)
          .filter(
            (assignment) =>
              state === undefined || assignment.state === state,
          )
          .map(studentAssignmentView),
      );
    },

    getAssignment({ session, assignmentId }) {
      return maybeResolve(
        authorizedAssignment({ session, assignmentId }),
        studentAssignmentView,
      );
    },

    getScorePracticeItem({ session, assignmentId }) {
      return maybeResolve(
        authorizedAssignment({ session, assignmentId }),
        (assignment) => {
          if (assignment.practiceType !== PRACTICE_TYPES.SCORE) {
            throw new Error("assignment is not SCORE");
          }

          if (
            typeof scoreSharingService?.getPracticeItem !== "function"
          ) {
            throw new Error("score practice unavailable");
          }

          return scoreSharingService.getPracticeItem({
            session,
            publicationId: assignment.sourceRef.publicationId,
          });
        },
      );
    },
  });
}
