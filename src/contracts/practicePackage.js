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
  }

  const content = value.content;
  if (!isRecord(content)) {
    errors.push("content must be an object");
  } else {
    if (!isRecord(content.score)) {
      errors.push("content.score must be an object");
    } else {
      if (content.score.format !== "musicxml") {
        errors.push("content.score.format must be musicxml");
      }
      if (!hasText(content.score.data)) {
        errors.push("content.score.data must be a non-empty string");
      }
    }

    if (!Array.isArray(content.canonicalEvents)) {
      errors.push("content.canonicalEvents must be an array");
    }
  }

  return { ok: errors.length === 0, errors };
}
