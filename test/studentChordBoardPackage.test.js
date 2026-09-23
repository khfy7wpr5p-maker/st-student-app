import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeChordBoardVoicingSnapshot,
  restoreStudentChordBoardPackageV1,
  validateStudentChordBoardPackageV1,
} from "../src/contracts/studentChordBoardPackage.js";

function validChordPackage() {
  return {
    schemaVersion: "1.0.0",
    packageType: "CHORD_BOARD",
    packageId: "assignment-chord-a",
    title: "Am Akor Çalışması",
    assignmentAuthority: {
      assignmentId: "assignment-chord-a",
      state: "teacher_assigned",
      assignedAt: "2026-09-23T10:00:00Z",
    },
    publication: {
      scope: "student_private",
      recipientStudentId: "server-student-a",
    },
    content: {
      chordBoard: {
        schemaVersion: 1,
        sourceKind: "chord_board_exact_voicing",
        chord: {
          canonicalSymbol: "Am",
          canonicalRoot: "A",
          quality: "minor",
          displayRoot: "A",
          displaySymbol: "Am",
        },
        voicing: {
          frets: [-1, 0, 2, 2, 1, 0],
          fingers: [-1, 0, 2, 3, 1, 0],
          barres: [],
          shape: "open",
          generated: false,
          curated: true,
        },
        provenance: {
          sourceRepository: "st-guitar-chord-board",
          sourceCommit:
            "1111111111111111111111111111111111111111",
          catalogFingerprint:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        voicingFingerprint:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
    practice: {
      teacherNote: "60 BPM ile çalış.",
    },
  };
}

test("valid StudentChordBoardPackageV1 restores exact deeply frozen data", () => {
  const raw = validChordPackage();

  assert.deepEqual(
    validateStudentChordBoardPackageV1(raw),
    { ok: true, errors: [] },
  );

  const restored =
    restoreStudentChordBoardPackageV1(raw);

  assert.equal(restored.packageType, "CHORD_BOARD");
  assert.equal(restored.packageId, "assignment-chord-a");
  assert.equal(
    restored.content.chordBoard.voicing.frets[2],
    2,
  );
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(
    Object.isFrozen(
      restored.content.chordBoard.voicing.frets,
    ),
    true,
  );
  assert.notEqual(restored, raw);
  assert.notEqual(
    restored.content.chordBoard,
    raw.content.chordBoard,
  );
});

test("CHORD_BOARD package requires exact top-level keys and discriminator", () => {
  const extra = validChordPackage();
  extra.score = {};

  assert.equal(
    validateStudentChordBoardPackageV1(extra).ok,
    false,
  );

  const missing = validChordPackage();
  delete missing.practice;

  assert.equal(
    validateStudentChordBoardPackageV1(missing).ok,
    false,
  );

  const wrongVersion = validChordPackage();
  wrongVersion.schemaVersion = "2.0.0";

  assert.equal(
    validateStudentChordBoardPackageV1(wrongVersion).ok,
    false,
  );

  const wrongType = validChordPackage();
  wrongType.packageType = "SCORE";

  assert.equal(
    validateStudentChordBoardPackageV1(wrongType).ok,
    false,
  );
});

test("CHORD_BOARD package rejects package and assignment authority mismatch", () => {
  const raw = validChordPackage();
  raw.packageId = "wrong-id";

  const result =
    validateStudentChordBoardPackageV1(raw);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("; "),
    /packageId.*assignmentAuthority\.assignmentId/i,
  );
});

test("CHORD_BOARD package requires teacher-assigned private publication authority", () => {
  const wrongState = validChordPackage();
  wrongState.assignmentAuthority.state = "draft";

  assert.equal(
    validateStudentChordBoardPackageV1(wrongState).ok,
    false,
  );

  const publicPackage = validChordPackage();
  publicPackage.publication.scope = "public_pool";

  assert.equal(
    validateStudentChordBoardPackageV1(publicPackage).ok,
    false,
  );

  const noRecipient = validChordPackage();
  noRecipient.publication.recipientStudentId = " ";

  assert.equal(
    validateStudentChordBoardPackageV1(noRecipient).ok,
    false,
  );
});

test("CHORD_BOARD content rejects SCORE or other mixed fields", () => {
  const raw = validChordPackage();
  raw.content.score = {
    format: "musicxml",
    data: "<score-partwise/>",
  };

  assert.equal(
    validateStudentChordBoardPackageV1(raw).ok,
    false,
  );
});

test("exact voicing requires six bounded fret and finger values", () => {
  const wrongLength = validChordPackage();
  wrongLength.content.chordBoard.voicing.frets =
    [-1, 0, 2];

  assert.equal(
    validateStudentChordBoardPackageV1(wrongLength).ok,
    false,
  );

  const fretTooHigh = validChordPackage();
  fretTooHigh.content.chordBoard.voicing.frets[2] = 21;

  assert.equal(
    validateStudentChordBoardPackageV1(fretTooHigh).ok,
    false,
  );

  const fingerTooHigh = validChordPackage();
  fingerTooHigh.content.chordBoard.voicing.fingers[2] = 5;

  assert.equal(
    validateStudentChordBoardPackageV1(fingerTooHigh).ok,
    false,
  );
});

test("exact voicing rejects inconsistent muted open and fretted fingers", () => {
  const muted = validChordPackage();
  muted.content.chordBoard.voicing.fingers[0] = 1;

  assert.equal(
    validateStudentChordBoardPackageV1(muted).ok,
    false,
  );

  const open = validChordPackage();
  open.content.chordBoard.voicing.fingers[1] = 1;

  assert.equal(
    validateStudentChordBoardPackageV1(open).ok,
    false,
  );

  const fretted = validChordPackage();
  fretted.content.chordBoard.voicing.fingers[2] = 0;

  assert.equal(
    validateStudentChordBoardPackageV1(fretted).ok,
    false,
  );
});

test("exact voicing preserves valid barre geometry and rejects invalid geometry", () => {
  const valid = validChordPackage();
  valid.content.chordBoard.voicing.barres = [
    {
      finger: 1,
      fret: 5,
      fromString: 6,
      toString: 1,
    },
  ];

  const snapshot =
    normalizeChordBoardVoicingSnapshot(
      valid.content.chordBoard,
    );

  assert.deepEqual(
    snapshot.voicing.barres[0],
    {
      finger: 1,
      fret: 5,
      fromString: 6,
      toString: 1,
    },
  );

  const reversed = validChordPackage();
  reversed.content.chordBoard.voicing.barres = [
    {
      finger: 1,
      fret: 5,
      fromString: 1,
      toString: 6,
    },
  ];

  assert.equal(
    validateStudentChordBoardPackageV1(reversed).ok,
    false,
  );

  const badFinger = validChordPackage();
  badFinger.content.chordBoard.voicing.barres = [
    {
      finger: 5,
      fret: 5,
      fromString: 6,
      toString: 1,
    },
  ];

  assert.equal(
    validateStudentChordBoardPackageV1(badFinger).ok,
    false,
  );
});

test("exact snapshot rejects unsupported fields and malformed fingerprints", () => {
  const extra = validChordPackage();
  extra.content.chordBoard.extra = true;

  assert.equal(
    validateStudentChordBoardPackageV1(extra).ok,
    false,
  );

  const fingerprint = validChordPackage();
  fingerprint.content.chordBoard.voicingFingerprint =
    "NOT-A-SHA";

  assert.equal(
    validateStudentChordBoardPackageV1(fingerprint).ok,
    false,
  );

  const catalog = validChordPackage();
  catalog.content.chordBoard.provenance.catalogFingerprint =
    "ABC";

  assert.equal(
    validateStudentChordBoardPackageV1(catalog).ok,
    false,
  );
});

test("practice teacherNote must be string and practice must be plain finite JSON", () => {
  const badNote = validChordPackage();
  badNote.practice.teacherNote = 60;

  assert.equal(
    validateStudentChordBoardPackageV1(badNote).ok,
    false,
  );

  const nonFinite = validChordPackage();
  nonFinite.practice.target = Number.POSITIVE_INFINITY;

  assert.equal(
    validateStudentChordBoardPackageV1(nonFinite).ok,
    false,
  );

  const nonPlain = validChordPackage();
  nonPlain.practice = new Date();

  assert.equal(
    validateStudentChordBoardPackageV1(nonPlain).ok,
    false,
  );
});

test("practice JSON rejects cycles", () => {
  const raw = validChordPackage();
  raw.practice.loop = raw.practice;

  assert.equal(
    validateStudentChordBoardPackageV1(raw).ok,
    false,
  );
});
