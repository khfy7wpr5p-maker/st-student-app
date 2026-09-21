import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function createPublication({
  publicationId,
  packageId,
  scope,
  recipientStudentId,
  publishedAt,
  revokedAt = null,
}) {
  if (!hasText(publicationId)) {
    throw new TypeError("publicationId must be a non-empty string");
  }
  if (!hasText(packageId)) {
    throw new TypeError("packageId must be a non-empty string");
  }
  if (!hasText(publishedAt)) {
    throw new TypeError("publishedAt must be a non-empty string");
  }

  if (scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL) {
    if (recipientStudentId !== undefined) {
      throw new TypeError("recipientStudentId is not allowed for public_pool");
    }

    return Object.freeze({
      publicationId,
      packageId,
      scope,
      publishedAt,
      revokedAt,
    });
  }

  if (scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE) {
    if (!hasText(recipientStudentId)) {
      throw new TypeError(
        "recipientStudentId is required for student_private",
      );
    }

    return Object.freeze({
      publicationId,
      packageId,
      scope,
      recipientStudentId,
      publishedAt,
      revokedAt,
    });
  }

  throw new TypeError("scope must be public_pool or student_private");
}
