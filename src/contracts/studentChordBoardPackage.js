export const STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION =
  "1.0.0";
export const STUDENT_CHORD_BOARD_PACKAGE_TYPE =
  "CHORD_BOARD";
export const CHORD_BOARD_VOICING_SCHEMA_VERSION = 1;
export const CHORD_BOARD_SOURCE_KIND =
  "chord_board_exact_voicing";
export const CHORD_BOARD_MAX_FRET = 20;

const DELIVERY_MAX_ID_LENGTH = 256;
const DELIVERY_MAX_DISPLAY_NAME_LENGTH = 160;
const DELIVERY_MAX_TIMESTAMP_LENGTH = 128;
const PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH =
  2000;

const ID_CONTROL = /[\u0000-\u001f\u007f]/u;
const PROSE_CONTROL =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "packageType",
  "packageId",
  "title",
  "assignmentAuthority",
  "publication",
  "content",
  "practice",
]);
const ASSIGNMENT_AUTHORITY_KEYS = Object.freeze([
  "assignmentId",
  "state",
  "assignedAt",
]);
const PUBLICATION_KEYS = Object.freeze([
  "scope",
  "recipientStudentId",
]);
const CONTENT_KEYS = Object.freeze([
  "chordBoard",
]);
const SNAPSHOT_KEYS = Object.freeze([
  "schemaVersion",
  "sourceKind",
  "chord",
  "voicing",
  "provenance",
  "voicingFingerprint",
]);
const CHORD_KEYS = Object.freeze([
  "canonicalSymbol",
  "canonicalRoot",
  "quality",
  "displayRoot",
  "displaySymbol",
]);
const VOICING_KEYS = Object.freeze([
  "frets",
  "fingers",
  "barres",
  "shape",
  "generated",
  "curated",
]);
const BARRE_KEYS = Object.freeze([
  "finger",
  "fret",
  "fromString",
  "toString",
]);
const PROVENANCE_KEYS = Object.freeze([
  "sourceRepository",
  "sourceCommit",
  "catalogFingerprint",
]);

function isPlainRecord(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exactKeys(value, keys, label, errors) {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }

  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      errors.push(
        `unsupported ${label} field: ${String(key)}`,
      );
    }
  }

  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${label}.${key} is required`);
    }
  }

  return true;
}

function assertExactKeys(value, keys, label) {
  const errors = [];
  exactKeys(value, keys, label, errors);
  if (errors.length > 0) {
    throw new TypeError(errors.join("; "));
  }
}

function normalizeRequiredId(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > DELIVERY_MAX_ID_LENGTH ||
    ID_CONTROL.test(normalized)
  ) {
    throw new TypeError(
      `${name} contains unsupported identity text`,
    );
  }

  return normalized;
}

function normalizeRequiredText(
  value,
  name,
  maxLength,
) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be text`);
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    PROSE_CONTROL.test(normalized)
  ) {
    throw new TypeError(
      `${name} contains unsupported text`,
    );
  }

  return normalized;
}

function normalizeOptionalText(
  value,
  name,
  maxLength,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (typeof value !== "string") {
    throw new TypeError(`${name} must be text`);
  }

  const normalized = value.trim();
  if (
    normalized.length > maxLength ||
    PROSE_CONTROL.test(normalized)
  ) {
    throw new TypeError(
      `${name} contains unsupported text`,
    );
  }

  return normalized;
}

function normalizeRequiredTimestamp(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be text`);
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length >
      DELIVERY_MAX_TIMESTAMP_LENGTH ||
    ID_CONTROL.test(normalized)
  ) {
    throw new TypeError(
      `${name} contains unsupported timestamp text`,
    );
  }

  return normalized;
}

function normalizeText(
  value,
  label,
  maxLength = 256,
) {
  return normalizeRequiredText(
    value,
    label,
    maxLength,
  );
}

function normalizeBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `${label} must be boolean`,
    );
  }

  return value;
}

function normalizeSha256(value, label) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value)
  ) {
    throw new TypeError(
      `${label} must be lowercase SHA-256 hex`,
    );
  }

  return value;
}

function normalizeSixIntegers(
  value,
  label,
  min,
  max,
) {
  if (!Array.isArray(value) || value.length !== 6) {
    throw new TypeError(
      `${label} must contain exactly six integer values`,
    );
  }

  return Object.freeze(
    value.map((entry) => {
      if (
        !Number.isInteger(entry) ||
        entry < min ||
        entry > max
      ) {
        throw new TypeError(
          `${label} values must be integers in ${min}..${max}`,
        );
      }

      return entry;
    }),
  );
}

function normalizeChord(value) {
  assertExactKeys(value, CHORD_KEYS, "chord");

  return Object.freeze({
    canonicalSymbol: normalizeText(
      value.canonicalSymbol,
      "chord.canonicalSymbol",
      64,
    ),
    canonicalRoot: normalizeText(
      value.canonicalRoot,
      "chord.canonicalRoot",
      16,
    ),
    quality: normalizeText(
      value.quality,
      "chord.quality",
      32,
    ),
    displayRoot: normalizeText(
      value.displayRoot,
      "chord.displayRoot",
      16,
    ),
    displaySymbol: normalizeText(
      value.displaySymbol,
      "chord.displaySymbol",
      64,
    ),
  });
}

function normalizeBarre(value) {
  assertExactKeys(value, BARRE_KEYS, "barre");

  const {
    finger,
    fret,
    fromString,
    toString,
  } = value;

  if (
    !Number.isInteger(finger) ||
    finger < 1 ||
    finger > 4
  ) {
    throw new TypeError(
      "barre finger must be an integer in 1..4",
    );
  }

  if (
    !Number.isInteger(fret) ||
    fret < 1 ||
    fret > CHORD_BOARD_MAX_FRET
  ) {
    throw new TypeError(
      `barre fret must be an integer in 1..${CHORD_BOARD_MAX_FRET}`,
    );
  }

  if (
    !Number.isInteger(fromString) ||
    fromString < 1 ||
    fromString > 6 ||
    !Number.isInteger(toString) ||
    toString < 1 ||
    toString > 6
  ) {
    throw new TypeError(
      "barre strings must be integers in 1..6",
    );
  }

  if (fromString < toString) {
    throw new TypeError(
      "barre fromString must be greater than or equal to toString",
    );
  }

  return Object.freeze({
    finger,
    fret,
    fromString,
    toString,
  });
}

function normalizeVoicing(value) {
  assertExactKeys(value, VOICING_KEYS, "voicing");

  const frets = normalizeSixIntegers(
    value.frets,
    "voicing.frets",
    -1,
    CHORD_BOARD_MAX_FRET,
  );
  const fingers = normalizeSixIntegers(
    value.fingers,
    "voicing.fingers",
    -1,
    4,
  );

  for (let index = 0; index < 6; index += 1) {
    if (
      frets[index] === -1 &&
      fingers[index] !== -1
    ) {
      throw new TypeError(
        "muted string finger must be -1",
      );
    }

    if (
      frets[index] === 0 &&
      fingers[index] !== 0
    ) {
      throw new TypeError(
        "open string finger must be 0",
      );
    }

    if (
      frets[index] > 0 &&
      (fingers[index] < 1 ||
        fingers[index] > 4)
    ) {
      throw new TypeError(
        "fretted string finger must be 1..4",
      );
    }
  }

  if (!Array.isArray(value.barres)) {
    throw new TypeError(
      "voicing.barres must be an array",
    );
  }

  return Object.freeze({
    frets,
    fingers,
    barres: Object.freeze(
      value.barres.map(normalizeBarre),
    ),
    shape: normalizeText(
      value.shape,
      "voicing.shape",
      64,
    ),
    generated: normalizeBoolean(
      value.generated,
      "voicing.generated",
    ),
    curated: normalizeBoolean(
      value.curated,
      "voicing.curated",
    ),
  });
}

function normalizeProvenance(value) {
  assertExactKeys(
    value,
    PROVENANCE_KEYS,
    "provenance",
  );

  return Object.freeze({
    sourceRepository: normalizeText(
      value.sourceRepository,
      "provenance.sourceRepository",
      256,
    ),
    sourceCommit: normalizeText(
      value.sourceCommit,
      "provenance.sourceCommit",
      128,
    ),
    catalogFingerprint: normalizeSha256(
      value.catalogFingerprint,
      "provenance.catalogFingerprint",
    ),
  });
}

export function normalizeChordBoardVoicingSnapshot(
  value,
) {
  assertExactKeys(
    value,
    SNAPSHOT_KEYS,
    "ChordBoardVoicingSnapshot",
  );

  if (
    value.schemaVersion !==
    CHORD_BOARD_VOICING_SCHEMA_VERSION
  ) {
    throw new TypeError(
      "ChordBoardVoicingSnapshot schemaVersion must be 1",
    );
  }

  if (value.sourceKind !== CHORD_BOARD_SOURCE_KIND) {
    throw new TypeError(
      "ChordBoardVoicingSnapshot sourceKind is unsupported",
    );
  }

  return Object.freeze({
    schemaVersion:
      CHORD_BOARD_VOICING_SCHEMA_VERSION,
    sourceKind: CHORD_BOARD_SOURCE_KIND,
    chord: normalizeChord(value.chord),
    voicing: normalizeVoicing(value.voicing),
    provenance: normalizeProvenance(
      value.provenance,
    ),
    voicingFingerprint: normalizeSha256(
      value.voicingFingerprint,
      "voicingFingerprint",
    ),
  });
}

function cloneFrozenJson(
  value,
  ancestors = new Set(),
) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "CHORD_BOARD package JSON number must be finite",
      );
    }

    return value;
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(
      "CHORD_BOARD package contains unsupported JSON value",
    );
  }

  if (ancestors.has(value)) {
    throw new TypeError(
      "CHORD_BOARD package contains a cyclic JSON value",
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        value.map((child) =>
          cloneFrozenJson(child, ancestors),
        ),
      );
    }

    if (!isPlainRecord(value)) {
      throw new TypeError(
        "CHORD_BOARD package JSON object must be plain data",
      );
    }

    const output = {};
    for (const [key, child] of Object.entries(
      value,
    )) {
      output[key] = cloneFrozenJson(
        child,
        ancestors,
      );
    }

    return Object.freeze(output);
  } finally {
    ancestors.delete(value);
  }
}

function validatePracticeJson(value) {
  if (!isPlainRecord(value)) {
    throw new TypeError(
      "practice must be a plain JSON object",
    );
  }

  cloneFrozenJson(value);
}

export function validateStudentChordBoardPackageV1(
  value,
) {
  const errors = [];

  if (
    !exactKeys(
      value,
      TOP_LEVEL_KEYS,
      "package",
      errors,
    )
  ) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze(errors),
    });
  }

  if (
    value.schemaVersion !==
    STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION
  ) {
    errors.push(
      "schemaVersion must be 1.0.0",
    );
  }

  if (
    value.packageType !==
    STUDENT_CHORD_BOARD_PACKAGE_TYPE
  ) {
    errors.push(
      "packageType must be CHORD_BOARD",
    );
  }

  try {
    normalizeRequiredId(
      value.packageId,
      "packageId",
    );
  } catch (error) {
    errors.push(error.message);
  }

  try {
    normalizeRequiredText(
      value.title,
      "title",
      DELIVERY_MAX_DISPLAY_NAME_LENGTH,
    );
  } catch (error) {
    errors.push(error.message);
  }

  if (
    exactKeys(
      value.assignmentAuthority,
      ASSIGNMENT_AUTHORITY_KEYS,
      "assignmentAuthority",
      errors,
    )
  ) {
    try {
      normalizeRequiredId(
        value.assignmentAuthority.assignmentId,
        "assignmentAuthority.assignmentId",
      );
    } catch (error) {
      errors.push(error.message);
    }

    if (
      value.assignmentAuthority.state !==
      "teacher_assigned"
    ) {
      errors.push(
        "assignmentAuthority.state must be teacher_assigned",
      );
    }

    try {
      normalizeRequiredTimestamp(
        value.assignmentAuthority.assignedAt,
        "assignmentAuthority.assignedAt",
      );
    } catch (error) {
      errors.push(error.message);
    }

    if (
      value.packageId !==
      value.assignmentAuthority.assignmentId
    ) {
      errors.push(
        "packageId must match assignmentAuthority.assignmentId",
      );
    }
  }

  if (
    exactKeys(
      value.publication,
      PUBLICATION_KEYS,
      "publication",
      errors,
    )
  ) {
    if (
      value.publication.scope !==
      "student_private"
    ) {
      errors.push(
        "publication.scope must be student_private",
      );
    }

    try {
      normalizeRequiredId(
        value.publication.recipientStudentId,
        "publication.recipientStudentId",
      );
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (
    exactKeys(
      value.content,
      CONTENT_KEYS,
      "content",
      errors,
    )
  ) {
    try {
      normalizeChordBoardVoicingSnapshot(
        value.content.chordBoard,
      );
    } catch (error) {
      errors.push(
        `content.chordBoard exact snapshot is invalid: ${error.message}`,
      );
    }
  }

  try {
    validatePracticeJson(value.practice);

    if (
      typeof value.practice.teacherNote !==
      "string"
    ) {
      errors.push(
        "practice.teacherNote must be a string",
      );
    } else {
      normalizeOptionalText(
        value.practice.teacherNote,
        "practice.teacherNote",
        PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      );
    }
  } catch (error) {
    errors.push(error.message);
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

export function restoreStudentChordBoardPackageV1(
  raw,
) {
  const validation =
    validateStudentChordBoardPackageV1(raw);

  if (!validation.ok) {
    throw new TypeError(
      `invalid StudentChordBoardPackageV1: ${validation.errors.join("; ")}`,
    );
  }

  return Object.freeze({
    schemaVersion:
      STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION,
    packageType:
      STUDENT_CHORD_BOARD_PACKAGE_TYPE,
    packageId: normalizeRequiredId(
      raw.packageId,
      "packageId",
    ),
    title: normalizeRequiredText(
      raw.title,
      "title",
      DELIVERY_MAX_DISPLAY_NAME_LENGTH,
    ),
    assignmentAuthority: Object.freeze({
      assignmentId: normalizeRequiredId(
        raw.assignmentAuthority.assignmentId,
        "assignmentAuthority.assignmentId",
      ),
      state: "teacher_assigned",
      assignedAt: normalizeRequiredTimestamp(
        raw.assignmentAuthority.assignedAt,
        "assignmentAuthority.assignedAt",
      ),
    }),
    publication: Object.freeze({
      scope: "student_private",
      recipientStudentId: normalizeRequiredId(
        raw.publication.recipientStudentId,
        "publication.recipientStudentId",
      ),
    }),
    content: Object.freeze({
      chordBoard:
        normalizeChordBoardVoicingSnapshot(
          raw.content.chordBoard,
        ),
    }),
    practice: cloneFrozenJson(raw.practice),
  });
}
