import {
  ASSIGNMENT_STATES,
} from "./privateAssignment.js";

export const STUDENT_PIECE_MANIFEST_SCHEMA_VERSION =
  "1.0.0";

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "pieceAssignmentId",
  "pieceId",
  "arrangementId",
  "title",
  "teacherNote",
  "state",
  "assignedAt",
  "contentRefs",
]);

const CONTENT_REF_KEYS = Object.freeze([
  "scoreAssignmentId",
  "chordAssignmentIds",
]);

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== "string" ||
      !allowed.has(key)
    ) {
      throw new TypeError(
        `unsupported ${label} field: ${String(key)}`,
      );
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(
        `${label}.${key} is required`,
      );
    }
  }
}

function requiredText(value, name) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `${name} must be a non-empty string`,
    );
  }
  return value.trim();
}

function normalizeContentRefs(value) {
  assertExactKeys(
    value,
    CONTENT_REF_KEYS,
    "contentRefs",
  );

  const scoreAssignmentId =
    value.scoreAssignmentId === null
      ? null
      : requiredText(
          value.scoreAssignmentId,
          "contentRefs.scoreAssignmentId",
        );

  if (!Array.isArray(value.chordAssignmentIds)) {
    throw new TypeError(
      "contentRefs.chordAssignmentIds must be an array",
    );
  }

  const chordAssignmentIds =
    value.chordAssignmentIds.map((id) =>
      requiredText(
        id,
        "contentRefs.chordAssignmentIds[]",
      ),
    );

  if (
    new Set(chordAssignmentIds).size !==
    chordAssignmentIds.length
  ) {
    throw new Error(
      "duplicate chord child authority",
    );
  }

  if (
    scoreAssignmentId !== null &&
    chordAssignmentIds.includes(
      scoreAssignmentId,
    )
  ) {
    throw new Error(
      "duplicate Piece child authority",
    );
  }

  if (
    scoreAssignmentId === null &&
    chordAssignmentIds.length === 0
  ) {
    throw new Error(
      "Piece must contain at least one supported child",
    );
  }

  return Object.freeze({
    scoreAssignmentId,
    chordAssignmentIds:
      Object.freeze(chordAssignmentIds),
  });
}

export function createStudentPieceManifest(
  value,
) {
  assertExactKeys(
    value,
    TOP_LEVEL_KEYS,
    "StudentPieceManifest",
  );

  if (
    value.schemaVersion !==
    STUDENT_PIECE_MANIFEST_SCHEMA_VERSION
  ) {
    throw new TypeError(
      "schemaVersion must be 1.0.0",
    );
  }

  if (
    !Object.values(ASSIGNMENT_STATES)
      .includes(value.state)
  ) {
    throw new TypeError(
      "state must be ACTIVE, COMPLETED or REPERTOIRE",
    );
  }

  if (typeof value.teacherNote !== "string") {
    throw new TypeError(
      "teacherNote must be a string",
    );
  }

  return Object.freeze({
    schemaVersion:
      STUDENT_PIECE_MANIFEST_SCHEMA_VERSION,
    pieceAssignmentId: requiredText(
      value.pieceAssignmentId,
      "pieceAssignmentId",
    ),
    pieceId: requiredText(
      value.pieceId,
      "pieceId",
    ),
    arrangementId: requiredText(
      value.arrangementId,
      "arrangementId",
    ),
    title: requiredText(
      value.title,
      "title",
    ),
    teacherNote: value.teacherNote.trim(),
    state: value.state,
    assignedAt: requiredText(
      value.assignedAt,
      "assignedAt",
    ),
    contentRefs: normalizeContentRefs(
      value.contentRefs,
    ),
  });
}
