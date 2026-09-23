export const ASSIGNMENT_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  REPERTOIRE: "REPERTOIRE",
});

export const PRACTICE_TYPES = Object.freeze({
  SCORE: "SCORE",
  CHORD_BOARD: "CHORD_BOARD",
});

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function requiredText(value, name) {
  if (!hasText(value)) {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function optionalRevokedAt(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return requiredText(value, "revokedAt");
}

function cloneAndFreeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreeze));
  }

  if (value !== null && typeof value === "object") {
    const clone = {};

    for (const [key, child] of Object.entries(value)) {
      clone[key] = cloneAndFreeze(child);
    }

    return Object.freeze(clone);
  }

  return value;
}

function normalizeScoreSource(sourceRef) {
  if (
    sourceRef === null ||
    typeof sourceRef !== "object" ||
    Array.isArray(sourceRef)
  ) {
    throw new TypeError("sourceRef must be an object for SCORE");
  }

  return Object.freeze({
    publicationId: requiredText(
      sourceRef.publicationId,
      "sourceRef.publicationId",
    ),
  });
}

function normalizeChordSnapshot(snapshot) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    throw new TypeError(
      "snapshot must be an object for CHORD_BOARD",
    );
  }

  requiredText(snapshot.displaySymbol, "snapshot.displaySymbol");
  requiredText(snapshot.canonicalSymbol, "snapshot.canonicalSymbol");

  if (!Array.isArray(snapshot.frets) || snapshot.frets.length !== 6) {
    throw new TypeError("snapshot.frets must contain six strings");
  }

  for (const fret of snapshot.frets) {
    if (!Number.isInteger(fret) || fret < -1) {
      throw new TypeError(
        "snapshot.frets entries must be integer frets or -1",
      );
    }
  }

  return cloneAndFreeze(snapshot);
}

export function createPrivateAssignment(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("PrivateAssignment must be an object");
  }

  if (!Object.values(PRACTICE_TYPES).includes(value.practiceType)) {
    throw new TypeError(
      "practiceType must be SCORE or CHORD_BOARD",
    );
  }

  if (!Object.values(ASSIGNMENT_STATES).includes(value.state)) {
    throw new TypeError(
      "state must be ACTIVE, COMPLETED or REPERTOIRE",
    );
  }

  if (typeof value.teacherNote !== "string") {
    throw new TypeError("teacherNote must be a string");
  }

  const assignment = {
    assignmentId: requiredText(value.assignmentId, "assignmentId"),
    studentId: requiredText(value.studentId, "studentId"),
    practiceType: value.practiceType,
    teacherNote: value.teacherNote,
    state: value.state,
    assignedAt: requiredText(value.assignedAt, "assignedAt"),
    revokedAt: optionalRevokedAt(value.revokedAt),
  };

  if (value.practiceType === PRACTICE_TYPES.SCORE) {
    assignment.sourceRef = normalizeScoreSource(value.sourceRef);
  } else {
    assignment.snapshot = normalizeChordSnapshot(value.snapshot);
  }

  return Object.freeze(assignment);
}
