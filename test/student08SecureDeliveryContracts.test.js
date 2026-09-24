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
import {
  makeChordBoardPackage,
} from "./support/chordBoardFixtures.js";

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


test("Secure Delivery assignment accepts strict CHORD_BOARD rows", () => {
  const raw = {
    deliveryId: "assignment-chord-a",
    assignmentId: "assignment-chord-a",
    packageId: "assignment-chord-a",
    practiceType: "CHORD_BOARD",
    teacherNote: "60 BPM ile çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeChordBoardPackage(),
  };

  const row =
    createSecureDeliveryAssignmentRow(raw);
  const view = toStudentAssignmentView(row);

  assert.equal(row.practiceType, "CHORD_BOARD");
  assert.equal(
    row.package.packageType,
    "CHORD_BOARD",
  );
  assert.equal(
    row.package.content.chordBoard.voicing.frets[2],
    2,
  );
  assert.equal(view.title, "Am Akor Çalışması");
  assert.equal(
    view.practiceType,
    "CHORD_BOARD",
  );
  assert.equal(Object.isFrozen(row.package), true);
});

test("Secure Delivery assignment rejects SCORE and CHORD_BOARD package type mismatches", () => {
  const chordRow = {
    deliveryId: "assignment-chord-a",
    assignmentId: "assignment-chord-a",
    packageId: "assignment-chord-a",
    practiceType: "CHORD_BOARD",
    teacherNote: "60 BPM ile çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeChordBoardPackage(),
  };

  assert.throws(
    () =>
      createSecureDeliveryAssignmentRow({
        ...chordRow,
        practiceType: "SCORE",
      }),
    /package|practiceType|SCORE|CHORD_BOARD/i,
  );

  const scorePackage =
    makeApprovedPracticePackage({
      packageId: "assignment-score-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    });

  assert.throws(
    () =>
      createSecureDeliveryAssignmentRow({
        deliveryId: "assignment-score-a",
        assignmentId: "assignment-score-a",
        packageId: "assignment-score-a",
        practiceType: "CHORD_BOARD",
        teacherNote: "",
        state: "ACTIVE",
        assignedAt: "2026-09-23T10:00:00Z",
        deliveredAt: "2026-09-23T10:01:00Z",
        package: scorePackage,
      }),
    /package|practiceType|SCORE|CHORD_BOARD/i,
  );
});

test("Secure Delivery CHORD_BOARD row enforces package assignment and teacher authority", () => {
  const base = {
    deliveryId: "assignment-chord-a",
    assignmentId: "assignment-chord-a",
    packageId: "assignment-chord-a",
    practiceType: "CHORD_BOARD",
    teacherNote: "60 BPM ile çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeChordBoardPackage(),
  };

  assert.throws(
    () =>
      createSecureDeliveryAssignmentRow({
        ...base,
        packageId: "assignment-other",
      }),
    /packageId/i,
  );

  assert.throws(
    () =>
      createSecureDeliveryAssignmentRow({
        ...base,
        package: makeChordBoardPackage({
          assignmentId: "assignment-other",
        }),
      }),
    /assignment|packageId|authority/i,
  );

  assert.throws(
    () =>
      createSecureDeliveryAssignmentRow({
        ...base,
        package: makeChordBoardPackage({
          teacherNote: "Başka not",
        }),
      }),
    /teacherNote|authority/i,
  );
});

test("Secure Delivery rejects unknown practice and package discriminators", () => {
  const chord = {
    deliveryId: "assignment-chord-a",
    assignmentId: "assignment-chord-a",
    packageId: "assignment-chord-a",
    practiceType: "CHORD_BOARD",
    teacherNote: "60 BPM ile çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeChordBoardPackage(),
  };

  assert.throws(
    () =>
      createSecureDeliveryAssignmentRow({
        ...chord,
        practiceType: "UNKNOWN",
      }),
    /practiceType/i,
  );

  const unknownPackage =
    makeChordBoardPackage();
  unknownPackage.packageType = "UNKNOWN";

  assert.throws(
    () =>
      createSecureDeliveryAssignmentRow({
        ...chord,
        package: unknownPackage,
      }),
    /packageType|CHORD_BOARD/i,
  );
});
