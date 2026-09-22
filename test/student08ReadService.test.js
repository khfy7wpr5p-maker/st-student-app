import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  POOL_AUDIENCE_MODES,
  createPoolItem,
} from "../src/contracts/poolItem.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
  createPrivateAssignment,
} from "../src/contracts/privateAssignment.js";
import { createStudent08ReadService } from "../src/sharing/student08ReadService.js";

const studentA = createStudentSession({ studentId: "student-a" });
const studentB = createStudentSession({ studentId: "student-b" });

function makePoolRepository(items) {
  return {
    list() {
      return items;
    },
    getById(poolItemId) {
      return items.find((item) => item.poolItemId === poolItemId) ?? null;
    },
  };
}

function makeAssignmentRepository(items) {
  return {
    listForStudent(studentId) {
      return items.filter((item) => item.studentId === studentId);
    },
    getById(assignmentId) {
      return items.find((item) => item.assignmentId === assignmentId) ?? null;
    },
  };
}

function buildService({
  poolItems = [],
  assignments = [],
  scoreSharingService = null,
} = {}) {
  return createStudent08ReadService({
    poolRepository: makePoolRepository(poolItems),
    assignmentRepository: makeAssignmentRepository(assignments),
    scoreSharingService,
  });
}

function selectedPool(id, recipients, revokedAt = null) {
  return createPoolItem({
    poolItemId: id,
    title: id,
    shortDescription: "Kısa",
    detailText: "Detay",
    publishedAt: "2026-09-22T16:00:00Z",
    audienceMode: POOL_AUDIENCE_MODES.SELECTED,
    recipientStudentIds: recipients,
    revokedAt,
  });
}

function allPool(id, revokedAt = null) {
  return createPoolItem({
    poolItemId: id,
    title: id,
    shortDescription: "Kısa",
    detailText: "Detay",
    publishedAt: "2026-09-22T16:00:00Z",
    audienceMode: POOL_AUDIENCE_MODES.ALL,
    revokedAt,
  });
}

function assignment({
  id,
  studentId,
  state = ASSIGNMENT_STATES.ACTIVE,
  revokedAt = null,
  publicationId = "pub-a",
} = {}) {
  return createPrivateAssignment({
    assignmentId: id,
    studentId,
    practiceType: PRACTICE_TYPES.SCORE,
    teacherNote: "Öğretmen notu",
    state,
    assignedAt: "2026-09-22T16:10:00Z",
    revokedAt,
    sourceRef: { publicationId },
  });
}

test("Pool reads require authentication and enforce ALL/SELECTED visibility", () => {
  const service = buildService({
    poolItems: [
      allPool("pool-all"),
      selectedPool("pool-a", ["student-a"]),
      selectedPool("pool-b", ["student-b"]),
      allPool("pool-revoked", "2026-09-22T17:00:00Z"),
    ],
  });

  assert.throws(() => service.listPoolItems({ session: null }), /unauthenticated/i);

  assert.deepEqual(
    service.listPoolItems({ session: studentA }).map((item) => item.poolItemId),
    ["pool-all", "pool-a"],
  );
  assert.deepEqual(
    service.listPoolItems({ session: studentB }).map((item) => item.poolItemId),
    ["pool-all", "pool-b"],
  );
});

test("Pool detail rechecks visibility and does not disclose recipient list", () => {
  const service = buildService({
    poolItems: [selectedPool("pool-a", ["student-a"])],
  });

  const item = service.getPoolItem({
    session: studentA,
    poolItemId: "pool-a",
  });

  assert.equal(item.poolItemId, "pool-a");
  assert.equal("recipientStudentIds" in item, false);

  assert.throws(
    () =>
      service.getPoolItem({
        session: studentB,
        poolItemId: "pool-a",
      }),
    /forbidden|not found/i,
  );
});

test("Assignment reads are exact-student, revoked-safe and state-filterable", () => {
  const service = buildService({
    assignments: [
      assignment({ id: "a-active", studentId: "student-a" }),
      assignment({
        id: "a-completed",
        studentId: "student-a",
        state: ASSIGNMENT_STATES.COMPLETED,
      }),
      assignment({ id: "b-active", studentId: "student-b" }),
      assignment({
        id: "a-revoked",
        studentId: "student-a",
        revokedAt: "2026-09-22T17:00:00Z",
      }),
    ],
  });

  assert.deepEqual(
    service.listAssignments({ session: studentA }).map((item) => item.assignmentId),
    ["a-active", "a-completed"],
  );
  assert.deepEqual(
    service
      .listAssignments({
        session: studentA,
        state: ASSIGNMENT_STATES.COMPLETED,
      })
      .map((item) => item.assignmentId),
    ["a-completed"],
  );
});

test("Student A cannot read Student B assignment or teacher note", () => {
  const service = buildService({
    assignments: [
      assignment({ id: "b-active", studentId: "student-b" }),
    ],
  });

  assert.throws(
    () =>
      service.getAssignment({
        session: studentA,
        assignmentId: "b-active",
      }),
    /forbidden/i,
  );
});

test("SCORE assignment delegates Practice opening only through its exact publication reference", () => {
  const seen = [];
  const service = buildService({
    assignments: [
      assignment({
        id: "a-score",
        studentId: "student-a",
        publicationId: "pub-private-a",
      }),
    ],
    scoreSharingService: {
      getPracticeItem(args) {
        seen.push(args);
        return { ok: true };
      },
    },
  });

  assert.deepEqual(
    service.getScorePracticeItem({
      session: studentA,
      assignmentId: "a-score",
    }),
    { ok: true },
  );
  assert.deepEqual(seen, [
    {
      session: studentA,
      publicationId: "pub-private-a",
    },
  ]);
});

test("Student read service exposes no teacher lifecycle writes", () => {
  const service = buildService();

  for (const name of [
    "publish",
    "revoke",
    "complete",
    "promoteToRepertoire",
    "updateTeacherNote",
  ]) {
    assert.equal(name in service, false, name);
  }
});
