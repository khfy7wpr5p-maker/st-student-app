import test from "node:test";
import assert from "node:assert/strict";

import {
  POOL_AUDIENCE_MODES,
  createPoolItem,
} from "../src/contracts/poolItem.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
  createPrivateAssignment,
} from "../src/contracts/privateAssignment.js";

function pool(overrides = {}) {
  return {
    poolItemId: "pool-1",
    title: "Yeni repertuar",
    shortDescription: "Bu hafta çalışılacak eser.",
    detailText: "Önce yavaş tempoda dinleyin.",
    publishedAt: "2026-09-22T16:00:00Z",
    audienceMode: POOL_AUDIENCE_MODES.ALL,
    revokedAt: null,
    ...overrides,
  };
}

function scoreAssignment(overrides = {}) {
  return {
    assignmentId: "assignment-a",
    studentId: "student-a",
    practiceType: PRACTICE_TYPES.SCORE,
    teacherNote: "İkinci ölçüyü yavaş çalış.",
    state: ASSIGNMENT_STATES.ACTIVE,
    assignedAt: "2026-09-22T16:10:00Z",
    revokedAt: null,
    sourceRef: {
      publicationId: "pub-private-a",
    },
    ...overrides,
  };
}

test("ALL PoolItem is immutable and carries no recipient list", () => {
  const item = createPoolItem(pool());

  assert.equal(item.audienceMode, "ALL");
  assert.equal("recipientStudentIds" in item, false);
  assert.equal(Object.isFrozen(item), true);
});

test("ALL PoolItem rejects any recipient list", () => {
  assert.throws(
    () => createPoolItem(pool({ recipientStudentIds: [] })),
    /recipientStudentIds.*ALL/i,
  );
});

test("SELECTED PoolItem requires recipients and normalizes them uniquely", () => {
  const item = createPoolItem(
    pool({
      audienceMode: POOL_AUDIENCE_MODES.SELECTED,
      recipientStudentIds: [" student-a ", "student-b", "student-a"],
    }),
  );

  assert.deepEqual(item.recipientStudentIds, ["student-a", "student-b"]);
  assert.equal(Object.isFrozen(item.recipientStudentIds), true);

  assert.throws(
    () =>
      createPoolItem(
        pool({
          audienceMode: POOL_AUDIENCE_MODES.SELECTED,
          recipientStudentIds: [],
        }),
      ),
    /recipientStudentIds/i,
  );
});

test("PrivateAssignment SCORE binds exactly one student to a publication source", () => {
  const assignment = createPrivateAssignment(scoreAssignment());

  assert.equal(assignment.studentId, "student-a");
  assert.equal(assignment.practiceType, "SCORE");
  assert.deepEqual(assignment.sourceRef, {
    publicationId: "pub-private-a",
  });
  assert.equal(Object.isFrozen(assignment), true);
  assert.equal(Object.isFrozen(assignment.sourceRef), true);
});

test("PrivateAssignment CHORD_BOARD preserves an immutable exact snapshot", () => {
  const assignment = createPrivateAssignment(
    scoreAssignment({
      assignmentId: "assignment-chord",
      practiceType: PRACTICE_TYPES.CHORD_BOARD,
      sourceRef: undefined,
      snapshot: {
        displaySymbol: "Am",
        canonicalSymbol: "A:min",
        frets: [-1, 0, 2, 2, 1, 0],
        fingering: { barre: null },
        midi: [45, 52, 57, 60, 64],
      },
    }),
  );

  assert.equal(assignment.practiceType, "CHORD_BOARD");
  assert.deepEqual(assignment.snapshot.frets, [-1, 0, 2, 2, 1, 0]);
  assert.equal(Object.isFrozen(assignment.snapshot), true);
  assert.equal(Object.isFrozen(assignment.snapshot.frets), true);
  assert.equal("sourceRef" in assignment, false);
});

test("PrivateAssignment rejects invalid identity, state, type and source shape", () => {
  assert.throws(
    () => createPrivateAssignment(scoreAssignment({ studentId: " " })),
    /studentId/i,
  );
  assert.throws(
    () => createPrivateAssignment(scoreAssignment({ state: "DONE" })),
    /state/i,
  );
  assert.throws(
    () => createPrivateAssignment(scoreAssignment({ practiceType: "TAB" })),
    /practiceType/i,
  );
  assert.throws(
    () =>
      createPrivateAssignment(
        scoreAssignment({ sourceRef: { revisionId: "internal-only" } }),
      ),
    /publicationId/i,
  );
});
