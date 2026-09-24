import test from "node:test";
import assert from "node:assert/strict";

import { createChordBoardViewModel } from "../src/ui/chordBoardViewModel.js";
import { renderPieceWorkspace } from "../src/ui/renderPieceWorkspace.js";
import { makeChordBoardPackage } from "./support/chordBoardFixtures.js";

function chordItem({
  assignmentId,
  packageId,
  symbol,
  frets,
}) {
  const pkg = makeChordBoardPackage({
    packageId,
    assignmentId,
    title: symbol,
    frets,
  });
  pkg.content.chordBoard.chord.displaySymbol = symbol;
  pkg.content.chordBoard.chord.canonicalSymbol = symbol;

  return createChordBoardViewModel({
    accessRef: {
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    },
    practiceType: "CHORD_BOARD",
    package: pkg,
  });
}

function workspace({
  selectedChordId = "assignment-f",
} = {}) {
  const am = chordItem({
    assignmentId: "assignment-am",
    packageId: "pkg-am",
    symbol: "Am",
    frets: [-1, 0, 2, 2, 1, 0],
  });
  const f = chordItem({
    assignmentId: "assignment-f",
    packageId: "pkg-f",
    symbol: "F",
    frets: [1, 3, 3, 2, 1, 1],
  });

  return {
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "",
    selectedView: "CHORDS",
    selectedChordId,
    availableViews: {
      score: false,
      chords: true,
    },
    returnContext: {
      folderState: "ACTIVE",
      scrollPosition: 0,
    },
    score: {
      status: "UNAVAILABLE",
      practice: null,
    },
    chords: {
      status: "AVAILABLE",
      items: [am, f],
    },
  };
}

test("Piece chord selector uses authorized assignment IDs, not package IDs", () => {
  const html = renderPieceWorkspace(workspace());

  assert.match(
    html,
    /data-action="select-piece-chord"[^>]*data-assignment-id="assignment-am"/s,
  );
  assert.match(
    html,
    /data-action="select-piece-chord"[^>]*data-assignment-id="assignment-f"[^>]*aria-pressed="true"/s,
  );
  assert.doesNotMatch(
    html,
    /data-assignment-id="pkg-(?:am|f)"/,
  );
  assert.equal(html.includes(">F</strong>"), true);
});

test("invalid Piece chord selection falls back only to an authorized chord", () => {
  const html = renderPieceWorkspace(
    workspace({
      selectedChordId: "not-authorized",
    }),
  );

  assert.match(
    html,
    /data-assignment-id="assignment-am"[^>]*aria-pressed="true"/s,
  );
  assert.doesNotMatch(html, /not-authorized/);
  assert.equal(html.includes(">Am</strong>"), true);
});
