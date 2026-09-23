import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "./privateAssignment.js";
import {
  PRACTICE_PACKAGE_SCOPES,
} from "./practicePackage.js";
import {
  restoreSecureDeliveryPackage,
} from "./secureDeliveryPackage.js";

const ALLOWED_KEYS = Object.freeze([
  "deliveryId",
  "assignmentId",
  "packageId",
  "practiceType",
  "teacherNote",
  "state",
  "assignedAt",
  "deliveredAt",
  "package",
]);

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createSecureDeliveryAssignmentRow(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("SecureDeliveryAssignmentRow must be an object");
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.includes(key)) {
      throw new TypeError(
        `unsupported SecureDeliveryAssignmentRow field: ${key}`,
      );
    }
  }

  const deliveryId = requiredText(value.deliveryId, "deliveryId");
  const assignmentId = requiredText(value.assignmentId, "assignmentId");
  const packageId = requiredText(value.packageId, "packageId");

  if (deliveryId !== assignmentId) {
    throw new Error("deliveryId must match assignmentId");
  }

  if (!Object.values(PRACTICE_TYPES).includes(value.practiceType)) {
    throw new TypeError(
      "practiceType must be SCORE or CHORD_BOARD",
    );
  }

  if (!Object.values(ASSIGNMENT_STATES).includes(value.state)) {
    throw new TypeError("state is invalid");
  }

  if (typeof value.teacherNote !== "string") {
    throw new TypeError("teacherNote must be a string");
  }

  const assignedAt = requiredText(
    value.assignedAt,
    "assignedAt",
  );
  const deliveredAt = requiredText(
    value.deliveredAt,
    "deliveredAt",
  );
  const pkg = restoreSecureDeliveryPackage({
    practiceType: value.practiceType,
    package: value.package,
  });

  if (pkg.packageId !== packageId) {
    throw new Error("packageId must match package");
  }

  if (
    pkg.publication.scope !==
    PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE
  ) {
    throw new Error("Secure Delivery package must be student_private");
  }

  if (
    value.practiceType ===
    PRACTICE_TYPES.CHORD_BOARD
  ) {
    if (
      pkg.assignmentAuthority.assignmentId !==
        assignmentId ||
      pkg.assignmentAuthority.assignedAt !==
        assignedAt ||
      pkg.practice.teacherNote !==
        value.teacherNote
    ) {
      throw new Error(
        "CHORD_BOARD assignment authority mismatch",
      );
    }
  }

  return Object.freeze({
    deliveryId,
    assignmentId,
    packageId,
    practiceType: value.practiceType,
    teacherNote: value.teacherNote,
    state: value.state,
    assignedAt,
    deliveredAt,
    package: pkg,
  });
}

export function toStudentAssignmentView(value) {
  const row = createSecureDeliveryAssignmentRow(value);

  return Object.freeze({
    assignmentId: row.assignmentId,
    title: row.package.title,
    practiceType: row.practiceType,
    teacherNote: row.teacherNote,
    state: row.state,
    assignedAt: row.assignedAt,
    sourceRef: Object.freeze({
      sourceKind: "SECURE_DELIVERY",
      deliveryId: row.deliveryId,
    }),
  });
}
