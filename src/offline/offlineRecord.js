import {
  PRACTICE_PACKAGE_SCOPES,
} from "../contracts/practicePackage.js";
import {
  restoreSecureDeliveryPackage,
} from "../contracts/secureDeliveryPackage.js";
import {
  createPracticeAccessRef,
  practiceAccessKey,
} from "../practice/practiceAccessRef.js";
import {
  assertPublishablePracticePackage,
} from "../sharing/packageEligibility.js";
import {
  createDeliveryItem,
} from "../sharing/deliveryItem.js";

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

function normalizePracticeItem({
  deliveryItem,
  practiceItem,
}) {
  if (practiceItem !== undefined) {
    if (
      practiceItem === null ||
      typeof practiceItem !== "object" ||
      Array.isArray(practiceItem)
    ) {
      throw new TypeError(
        "practiceItem must be an object",
      );
    }

    const accessRef = createPracticeAccessRef(
      practiceItem.accessRef,
    );
    if (accessRef.kind !== "SECURE_DELIVERY") {
      throw new TypeError(
        "practiceItem accessRef must be SECURE_DELIVERY",
      );
    }

    const pkg =
      restoreSecureDeliveryPackage({
        practiceType:
          practiceItem.practiceType,
        package: practiceItem.package,
      });

    if (
      pkg.publication.scope !==
      PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE
    ) {
      throw new Error(
        "Secure Delivery offline package must be student_private",
      );
    }

    return {
      accessRef,
      publication: null,
      practiceType:
        practiceItem.practiceType,
      package: pkg,
    };
  }

  const normalized = createDeliveryItem(
    deliveryItem?.publication,
    deliveryItem?.package,
  );

  return {
    accessRef: createPracticeAccessRef({
      kind: "PUBLICATION",
      publicationId:
        normalized.publication.publicationId,
    }),
    publication: normalized.publication,
    practiceType: null,
    package: normalized.package,
  };
}

export function createOfflineRecord({
  studentId,
  deliveryItem,
  practiceItem,
  cachedAt,
  lastVerifiedAt,
  accessState,
}) {
  requireText(studentId, "studentId");
  requireText(cachedAt, "cachedAt");
  requireText(lastVerifiedAt, "lastVerifiedAt");

  if (
    !Object.values(
      OFFLINE_ACCESS_STATES,
    ).includes(accessState)
  ) {
    throw new TypeError(
      "accessState must be ACTIVE or REVOKED",
    );
  }

  const normalized = normalizePracticeItem({
    deliveryItem,
    practiceItem,
  });

  if (
    normalized.accessRef.kind === "PUBLICATION" &&
    normalized.publication.scope ===
      PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE &&
    normalized.publication.recipientStudentId !==
      studentId
  ) {
    throw new Error(
      "private offline record belongs to a different student",
    );
  }

  const base = {
    studentId,
    accessRef: normalized.accessRef,
    accessKey: practiceAccessKey(
      normalized.accessRef,
    ),
    packageId: normalized.package.packageId,
    scope: normalized.package.publication.scope,
    publication: normalized.publication,
    package: normalized.package,
    cachedAt,
    lastVerifiedAt,
    accessState,
  };

  if (
    normalized.accessRef.kind ===
    "SECURE_DELIVERY"
  ) {
    base.practiceType =
      normalized.practiceType;
  }

  if (
    normalized.accessRef.kind === "PUBLICATION"
  ) {
    base.publicationId =
      normalized.accessRef.publicationId;
  }

  return deepFreeze(
    structuredClone(base),
  );
}
