export const PRACTICE_PACKAGE_SCHEMA_VERSION = "1.0.0";

export const PRACTICE_PACKAGE_SCOPES = Object.freeze({
  PUBLIC_POOL: "public_pool",
  STUDENT_PRIVATE: "student_private",
});

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "packageId",
  "workId",
  "title",
  "approvedRevision",
  "publication",
  "content",
  "practice",
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

function validateMusicXmlPayload(value, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }

  const keys = Object.keys(value);
  for (const key of keys) {
    if (key !== "format" && key !== "data") {
      errors.push(`unsupported ${label} field: ${key}`);
    }
  }

  if (value.format !== "musicxml") {
    errors.push(`${label}.format must be musicxml`);
  }
  if (!hasText(value.data)) {
    errors.push(`${label}.data must be a non-empty string`);
  }

  return (
    keys.every((key) => key === "format" || key === "data") &&
    value.format === "musicxml" &&
    hasText(value.data)
  );
}

export function validatePracticePackage(value) {
  const errors = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["package must be an object"] };
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`unsupported top-level field: ${key}`);
    }
  }

  if (value.schemaVersion !== PRACTICE_PACKAGE_SCHEMA_VERSION) {
    errors.push("schemaVersion must be 1.0.0");
  }

  for (const field of ["packageId", "workId", "title"]) {
    if (!hasText(value[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  const revision = value.approvedRevision;
  if (!isRecord(revision)) {
    errors.push("approvedRevision must be an object");
  } else {
    if (!hasText(revision.revisionId)) {
      errors.push("approvedRevision.revisionId must be a non-empty string");
    }
    if (revision.state !== "teacher_approved") {
      errors.push("approvedRevision.state must be teacher_approved");
    }
    if (!hasText(revision.approvedAt)) {
      errors.push("approvedRevision.approvedAt must be a non-empty string");
    }
  }

  const publication = value.publication;
  if (!isRecord(publication)) {
    errors.push("publication must be an object");
  } else {
    const validScope = Object.values(PRACTICE_PACKAGE_SCOPES).includes(
      publication.scope,
    );

    if (!validScope) {
      errors.push("publication.scope must be public_pool or student_private");
    }

    if (
      publication.scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE &&
      !hasText(publication.recipientStudentId)
    ) {
      errors.push(
        "publication.recipientStudentId is required for student_private",
      );
    }

    if (
      publication.scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL &&
      "recipientStudentId" in publication
    ) {
      errors.push(
        "publication.recipientStudentId is not allowed for public_pool",
      );
    }
  }

  const content = value.content;
  if (!isRecord(content)) {
    errors.push("content must be an object");
  } else {
    validateMusicXmlPayload(
      content.score,
      "content.score",
      errors,
    );

    if (
      content.guitarTab !== undefined &&
      content.guitarTab !== null
    ) {
      validateMusicXmlPayload(
        content.guitarTab,
        "content.guitarTab",
        errors,
      );
    }

    if (!Array.isArray(content.canonicalEvents)) {
      errors.push("content.canonicalEvents must be an array");
    }
  }

  return { ok: errors.length === 0, errors };
}
