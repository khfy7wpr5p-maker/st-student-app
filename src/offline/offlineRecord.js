import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";
import { createDeliveryItem } from "../sharing/deliveryItem.js";

export const OFFLINE_ACCESS_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
});

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function requireText(value, name) {
  if (!hasText(value)) {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  return value;
}

export function createOfflineRecord({
  studentId,
  deliveryItem,
  cachedAt,
  lastVerifiedAt,
  accessState,
}) {
  requireText(studentId, "studentId");
  requireText(cachedAt, "cachedAt");
  requireText(lastVerifiedAt, "lastVerifiedAt");

  if (!Object.values(OFFLINE_ACCESS_STATES).includes(accessState)) {
    throw new TypeError("accessState must be ACTIVE or REVOKED");
  }

  const normalized = createDeliveryItem(
    deliveryItem?.publication,
    deliveryItem?.package,
  );

  if (
    normalized.publication.scope ===
      PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE &&
    normalized.publication.recipientStudentId !== studentId
  ) {
    throw new Error("private offline record belongs to a different student");
  }

  return deepFreeze(
    structuredClone({
      studentId,
      publicationId: normalized.publication.publicationId,
      packageId: normalized.package.packageId,
      scope: normalized.publication.scope,
      publication: normalized.publication,
      package: normalized.package,
      cachedAt,
      lastVerifiedAt,
      accessState,
    }),
  );
}
