import {
  PRACTICE_TYPES,
} from "./privateAssignment.js";
import {
  validatePracticePackage,
} from "./practicePackage.js";
import {
  STUDENT_CHORD_BOARD_PACKAGE_TYPE,
  restoreStudentChordBoardPackageV1,
} from "./studentChordBoardPackage.js";

function cloneAndFreeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map(cloneAndFreeze),
    );
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const clone = {};
    for (const [key, child] of Object.entries(
      value,
    )) {
      clone[key] = cloneAndFreeze(child);
    }
    return Object.freeze(clone);
  }

  return value;
}

export function restoreSecureDeliveryPackage({
  practiceType,
  package: raw,
} = {}) {
  if (practiceType === PRACTICE_TYPES.SCORE) {
    if (
      raw !== null &&
      typeof raw === "object" &&
      Object.hasOwn(raw, "packageType")
    ) {
      throw new TypeError(
        "SCORE secure delivery package must not declare packageType",
      );
    }

    const validation =
      validatePracticePackage(raw);

    if (!validation.ok) {
      throw new TypeError(
        `invalid SCORE secure delivery package: ${validation.errors.join("; ")}`,
      );
    }

    return cloneAndFreeze(raw);
  }

  if (
    practiceType ===
    PRACTICE_TYPES.CHORD_BOARD
  ) {
    if (
      raw?.packageType !==
      STUDENT_CHORD_BOARD_PACKAGE_TYPE
    ) {
      throw new TypeError(
        "CHORD_BOARD secure delivery packageType must be CHORD_BOARD",
      );
    }

    return restoreStudentChordBoardPackageV1(
      raw,
    );
  }

  throw new TypeError(
    "unsupported Secure Delivery practiceType",
  );
}
