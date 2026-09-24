import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  createSecureDeliveryStudent08ReadService,
} from "../src/sharing/secureDeliveryStudent08ReadService.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";
import {
  makeChordBoardRow,
} from "./support/chordBoardFixtures.js";

const studentA = createStudentSession({
  studentId: "firebase-uid-a",
});

function chordRow(
  assignmentId = "assignment-chord-a",
  state = "ACTIVE",
) {
  return makeChordBoardRow({
    assignmentId,
    state,
  });
}

function scoreRow(
  assignmentId = "assignment-score-a",
) {
  return {
    deliveryId: assignmentId,
    assignmentId,
    packageId: `pkg-${assignmentId}`,
    practiceType: "SCORE",
    teacherNote: "",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeApprovedPracticePackage({
      packageId: `pkg-${assignmentId}`,
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  };
}

function serviceFor(row) {
  return createSecureDeliveryStudent08ReadService({
    apiClient: {
      async listStudentPool() {
        return [];
      },
      async listStudentAssignments() {
        return [row];
      },
      async getStudentAssignment(deliveryId) {
        assert.equal(
          deliveryId,
          row.assignmentId,
        );
        return row;
      },
    },
  });
}

test("Student08 read service lists and details CHORD_BOARD assignments", async () => {
  const service = serviceFor(chordRow());

  const items = await service.listAssignments({
    session: studentA,
    state: "ACTIVE",
  });

  assert.equal(items.length, 1);
  assert.equal(
    items[0].practiceType,
    "CHORD_BOARD",
  );
  assert.equal(
    items[0].title,
    "Am Akor Çalışması",
  );

  const detail = await service.getAssignment({
    session: studentA,
    assignmentId: "assignment-chord-a",
  });

  assert.equal(
    detail.assignmentId,
    "assignment-chord-a",
  );
  assert.equal(
    detail.practiceType,
    "CHORD_BOARD",
  );
});

test("getChordBoardPracticeItem returns exact CHORD_BOARD envelope", async () => {
  const service = serviceFor(chordRow());

  const item =
    await service.getChordBoardPracticeItem({
      session: studentA,
      assignmentId: "assignment-chord-a",
    });

  assert.deepEqual(item.accessRef, {
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-chord-a",
  });
  assert.equal(
    item.practiceType,
    "CHORD_BOARD",
  );
  assert.equal(
    item.package.packageType,
    "CHORD_BOARD",
  );
  assert.deepEqual(
    item.package.content.chordBoard.voicing.frets,
    [-1, 0, 2, 2, 1, 0],
  );
});

test("SCORE and CHORD_BOARD practice read methods stay type-isolated", async () => {
  const chordService =
    serviceFor(chordRow());

  await assert.rejects(
    () =>
      chordService.getScorePracticeItem({
        session: studentA,
        assignmentId: "assignment-chord-a",
      }),
    /assignment type unavailable/i,
  );

  const scoreService =
    serviceFor(scoreRow());

  await assert.rejects(
    () =>
      scoreService.getChordBoardPracticeItem({
        session: studentA,
        assignmentId: "assignment-score-a",
      }),
    /assignment type unavailable/i,
  );

  const score =
    await scoreService.getScorePracticeItem({
      session: studentA,
      assignmentId: "assignment-score-a",
    });

  assert.equal(score.practiceType, "SCORE");
  assert.equal(
    score.package.packageId,
    "pkg-assignment-score-a",
  );
});

test("CHORD_BOARD practice read still requires authenticated exact assignment identity", async () => {
  const service = serviceFor(chordRow());

  await assert.rejects(
    () =>
      service.getChordBoardPracticeItem({
        session: null,
        assignmentId: "assignment-chord-a",
      }),
    /unauthenticated/i,
  );

  const mismatch =
    createSecureDeliveryStudent08ReadService({
      apiClient: {
        async listStudentPool() {
          return [];
        },
        async listStudentAssignments() {
          return [];
        },
        async getStudentAssignment() {
          return chordRow(
            "assignment-chord-other",
          );
        },
      },
    });

  await assert.rejects(
    () =>
      mismatch.getChordBoardPracticeItem({
        session: studentA,
        assignmentId: "assignment-chord-a",
      }),
    /identity mismatch/i,
  );
});
