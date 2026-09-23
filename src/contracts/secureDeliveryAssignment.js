import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "./privateAssignment.js";
import {
  PRACTICE_PACKAGE_SCOPES,
  validatePracticePackage,
} from "./practicePackage.js";

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

  if (value.practiceType !== PRACTICE_TYPES.SCORE) {
    throw new TypeError("practiceType must be SCORE");
  }

  if (!Object.values(ASSIGNMENT_STATES).includes(value.state)) {
    throw new TypeError("state is invalid");
  }

  if (typeof value.teacherNote !== "string") {
    throw new TypeError("teacherNote must be a string");
  }

  const validation = validatePracticePackage(value.package);
  if (!validation.ok) {
    throw new TypeError(
      `invalid PracticePackage: ${validation.errors.join("; ")}`,
    );
  }

  if (value.package.packageId !== packageId) {
    throw new Error("packageId must match package");
  }

  if (
    value.package.publication.scope !==
    PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE
  ) {
    throw new Error("Secure Delivery package must be student_private");
  }

  return Object.freeze({
    deliveryId,
    assignmentId,
    packageId,
    practiceType: value.practiceType,
    teacherNote: value.teacherNote,
    state: value.state,
    assignedAt: requiredText(value.assignedAt, "assignedAt"),
    deliveredAt: requiredText(value.deliveredAt, "deliveredAt"),
    package: cloneAndFreeze(value.package),
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
