import test from "node:test";
import assert from "node:assert/strict";

import {
  createStudentPoolView,
} from "../src/contracts/studentPoolView.js";
import {
  createSecureDeliveryAssignmentRow,
  toStudentAssignmentView,
} from "../src/contracts/secureDeliveryAssignment.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";

test("StudentPoolView accepts only sanitized fields", () => {
  const view = createStudentPoolView({
    poolItemId: "pool-a",
    title: "Duyuru",
    shortDescription: "Kısa",
    detailText: "Detay",
    publishedAt: "2026-09-23T10:00:00Z",
    audienceMode: "SELECTED",
  });

  assert.equal(view.poolItemId, "pool-a");
  assert.equal("recipientStudentIds" in view, false);
  assert.equal(Object.isFrozen(view), true);

  assert.throws(
    () => createStudentPoolView({
      ...view,
      recipientStudentIds: ["student-a"],
    }),
    /unsupported|recipient/i,
  );

  assert.throws(
    () => createStudentPoolView({
      ...view,
      audienceMode: "UNKNOWN",
    }),
    /audienceMode/i,
  );
});

test("Secure Delivery assignment requires exact metadata and no fake publication", () => {
  const raw = {
    deliveryId: "assignment-a",
    assignmentId: "assignment-a",
    packageId: "pkg-a",
    practiceType: "SCORE",
    teacherNote: "Yavaş çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeApprovedPracticePackage({
      packageId: "pkg-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  };

  const row = createSecureDeliveryAssignmentRow(raw);
  const view = toStudentAssignmentView(row);

  assert.deepEqual(view.sourceRef, {
    sourceKind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  });
  assert.equal(JSON.stringify(view).includes("publicationId"), false);
  assert.equal(view.state, "ACTIVE");
  assert.equal(Object.isFrozen(row), true);
  assert.equal(Object.isFrozen(row.package), true);

  raw.package.title = "MUTATED";
  assert.notEqual(row.package.title, "MUTATED");
});

test("Secure Delivery assignment rejects extra fields and identity mismatches", () => {
  const base = {
    deliveryId: "assignment-a",
    assignmentId: "assignment-a",
    packageId: "pkg-a",
    practiceType: "SCORE",
    teacherNote: "",
    state: "COMPLETED",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeApprovedPracticePackage({
      packageId: "pkg-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  };

  assert.throws(
    () => createSecureDeliveryAssignmentRow({
      ...base,
      teacherId: "teacher-a",
    }),
    /unsupported/i,
  );
  assert.throws(
    () => createSecureDeliveryAssignmentRow({
      ...base,
      deliveryId: "delivery-other",
    }),
    /deliveryId|assignmentId/i,
  );
  assert.throws(
    () => createSecureDeliveryAssignmentRow({
      ...base,
      packageId: "pkg-other",
    }),
    /packageId/i,
  );
  assert.throws(
    () => createSecureDeliveryAssignmentRow({
      ...base,
      state: "UNKNOWN",
    }),
    /state/i,
  );
});
