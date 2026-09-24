import test from "node:test";
import assert from "node:assert/strict";

import {
  createStudentPieceManifest,
} from "../src/contracts/pieceAssignment.js";

function validManifest(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "",
    state: "ACTIVE",
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: {
      scoreAssignmentId: "score-a",
      chordAssignmentIds: ["chord-a", "chord-b"],
    },
    ...overrides,
  };
}

test("Piece manifest keeps display title separate from authority identity", () => {
  const a = createStudentPieceManifest(validManifest());
  const b = createStudentPieceManifest(
    validManifest({
      pieceAssignmentId: "piece-b",
      pieceId: "work-b",
      arrangementId: "arr-b",
      title: "Cambaz",
      contentRefs: {
        scoreAssignmentId: null,
        chordAssignmentIds: ["chord-c"],
      },
    }),
  );

  assert.equal(a.title, b.title);
  assert.notEqual(a.pieceId, b.pieceId);
  assert.notEqual(a.arrangementId, b.arrangementId);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.contentRefs), true);
  assert.equal(
    Object.isFrozen(a.contentRefs.chordAssignmentIds),
    true,
  );
});

test("Piece manifest requires exact V1 keys and supported lifecycle state", () => {
  const piece = createStudentPieceManifest(validManifest());
  assert.deepEqual(
    Object.keys(piece).sort(),
    [
      "arrangementId",
      "assignedAt",
      "contentRefs",
      "pieceAssignmentId",
      "pieceId",
      "schemaVersion",
      "state",
      "teacherNote",
      "title",
    ],
  );

  for (const extra of [
    { studentId: "student-a" },
    { teacherId: "teacher-a" },
    { package: {} },
    { tabAssignmentId: "tab-a" },
  ]) {
    assert.throws(
      () =>
        createStudentPieceManifest({
          ...validManifest(),
          ...extra,
        }),
      /unsupported/i,
    );
  }

  assert.throws(
    () =>
      createStudentPieceManifest(
        validManifest({ state: "ARCHIVED" }),
      ),
    /state/i,
  );
});

test("Piece manifest rejects duplicate or ambiguous child refs and zero supported children", () => {
  assert.throws(
    () =>
      createStudentPieceManifest(
        validManifest({
          contentRefs: {
            scoreAssignmentId: null,
            chordAssignmentIds: ["chord-a", "chord-a"],
          },
        }),
      ),
    /duplicate/i,
  );

  assert.throws(
    () =>
      createStudentPieceManifest(
        validManifest({
          contentRefs: {
            scoreAssignmentId: "shared",
            chordAssignmentIds: ["shared"],
          },
        }),
      ),
    /duplicate|same/i,
  );

  assert.throws(
    () =>
      createStudentPieceManifest(
        validManifest({
          contentRefs: {
            scoreAssignmentId: null,
            chordAssignmentIds: [],
          },
        }),
      ),
    /at least one|supported child/i,
  );
});

test("Piece manifest allows score-only and chords-only V1 content without TAB", () => {
  const scoreOnly = createStudentPieceManifest(
    validManifest({
      contentRefs: {
        scoreAssignmentId: "score-only",
        chordAssignmentIds: [],
      },
    }),
  );
  const chordsOnly = createStudentPieceManifest(
    validManifest({
      contentRefs: {
        scoreAssignmentId: null,
        chordAssignmentIds: ["chord-only"],
      },
    }),
  );

  assert.equal(
    scoreOnly.contentRefs.scoreAssignmentId,
    "score-only",
  );
  assert.deepEqual(
    chordsOnly.contentRefs.chordAssignmentIds,
    ["chord-only"],
  );
  assert.equal("tabAssignmentId" in scoreOnly.contentRefs, false);
});
