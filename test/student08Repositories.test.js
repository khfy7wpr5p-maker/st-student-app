import test from "node:test";
import assert from "node:assert/strict";

import {
  POOL_AUDIENCE_MODES,
} from "../src/contracts/poolItem.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import { createInMemoryPoolRepository } from "../src/sharing/inMemoryPoolRepository.js";
import { createInMemoryAssignmentRepository } from "../src/sharing/inMemoryAssignmentRepository.js";

function poolItem(overrides = {}) {
  return {
    poolItemId: "pool-a",
    title: "Duyuru",
    shortDescription: "Kısa",
    detailText: "Detay",
    publishedAt: "2026-09-22T16:00:00Z",
    audienceMode: POOL_AUDIENCE_MODES.ALL,
    revokedAt: null,
    ...overrides,
  };
}

function assignment(overrides = {}) {
  return {
    assignmentId: "assignment-a",
    studentId: "student-a",
    practiceType: PRACTICE_TYPES.SCORE,
    teacherNote: "Yavaş çalış.",
    state: ASSIGNMENT_STATES.ACTIVE,
    assignedAt: "2026-09-22T16:10:00Z",
    revokedAt: null,
    sourceRef: { publicationId: "pub-a" },
    ...overrides,
  };
}

test("Pool repository stores immutable snapshots and exposes read-only surface", () => {
  const source = poolItem();
  const repository = createInMemoryPoolRepository([source]);

  source.title = "mutated";

  assert.equal(repository.getById("pool-a").title, "Duyuru");
  assert.equal(Object.isFrozen(repository.getById("pool-a")), true);
  assert.deepEqual(
    repository.list().map((item) => item.poolItemId),
    ["pool-a"],
  );
  assert.equal("save" in repository, false);
  assert.equal("revoke" in repository, false);
});

test("Assignment repository isolates list queries by stable studentId", () => {
  const repository = createInMemoryAssignmentRepository([
    assignment(),
    assignment({
      assignmentId: "assignment-b",
      studentId: "student-b",
      sourceRef: { publicationId: "pub-b" },
    }),
  ]);

  assert.deepEqual(
    repository
      .listForStudent("student-a")
      .map((item) => item.assignmentId),
    ["assignment-a"],
  );
  assert.equal(repository.getById("assignment-b").studentId, "student-b");
  assert.equal("complete" in repository, false);
  assert.equal("updateTeacherNote" in repository, false);
});

test("repositories reject duplicate identifiers at construction", () => {
  assert.throws(
    () =>
      createInMemoryPoolRepository([
        poolItem(),
        poolItem({ title: "Second" }),
      ]),
    /poolItemId already exists/i,
  );

  assert.throws(
    () =>
      createInMemoryAssignmentRepository([
        assignment(),
        assignment({ teacherNote: "Second" }),
      ]),
    /assignmentId already exists/i,
  );
});
