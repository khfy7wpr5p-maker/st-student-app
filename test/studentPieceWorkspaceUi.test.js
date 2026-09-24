import test from "node:test";
import assert from "node:assert/strict";

import { ASSIGNMENT_STATES } from "../src/contracts/privateAssignment.js";
import { createChordBoardViewModel } from "../src/ui/chordBoardViewModel.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";
import { makeChordBoardPracticeItem } from "./support/chordBoardFixtures.js";

function scorePractice() {
  return Object.freeze({
    packageId: "pkg-score-a",
    title: "Cambaz",
    playbackQuality: "APPROXIMATE",
    capabilities: Object.freeze({
      notation: "AVAILABLE",
      playback: "AVAILABLE",
      tempoChange: "UNAVAILABLE",
      measureRepeat: "UNAVAILABLE",
      guitarTab: "UNAVAILABLE",
      violin: "UNAVAILABLE",
    }),
    practice: Object.freeze({
      tempoBpm: 80,
      measureRepeatEnabled: false,
    }),
  });
}

function pieceSummary() {
  return Object.freeze({
    itemKind: "PIECE",
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "Parçayı yavaş çalış.",
    state: ASSIGNMENT_STATES.ACTIVE,
    assignedAt: "2026-09-24T08:00:00Z",
  });
}

function workspace(selectedView = "SCORE") {
  const am = createChordBoardViewModel(
    makeChordBoardPracticeItem({
      assignmentId: "chord-am",
      title: "Am",
    }),
  );
  const f = createChordBoardViewModel(
    makeChordBoardPracticeItem({
      assignmentId: "chord-f",
      title: "F",
      barres: [
        {
          finger: 1,
          fret: 1,
          fromString: 6,
          toString: 1,
        },
      ],
    }),
  );

  return Object.freeze({
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "Parçayı yavaş çalış.",
    folderState: "ACTIVE",
    selectedView,
    selectedChordId: "chord-am",
    availableViews: Object.freeze({
      score: true,
      chords: true,
    }),
    returnContext: Object.freeze({
      folderState: "ACTIVE",
      scrollPosition: 420,
    }),
    score: Object.freeze({
      status: "AVAILABLE",
      practice: scorePractice(),
    }),
    chords: Object.freeze({
      status: "AVAILABLE",
      items: Object.freeze([am, f]),
    }),
  });
}

test("Piece-enabled My Work shows one musical work card instead of child assignment cards", () => {
  const html = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.MY_WORK,
    session: { studentId: "student-a" },
    assignmentState: ASSIGNMENT_STATES.ACTIVE,
    items: [
      pieceSummary(),
      {
        assignmentId: "legacy-score",
        title: "Eski Etüt",
        practiceType: "SCORE",
        teacherNote: "",
        state: "ACTIVE",
        assignedAt: "2026-09-24T07:00:00Z",
      },
    ],
    practice: null,
    chordBoard: null,
  });

  assert.match(
    html,
    /data-action="open-piece"[^>]*data-piece-assignment-id="piece-a"[^>]*data-assignment-state="ACTIVE"/s,
  );
  assert.match(html, />\s*Cambaz\s*</);
  assert.equal(
    (html.match(/data-piece-assignment-id="piece-a"/g) ?? []).length,
    1,
  );
  assert.match(
    html,
    /data-action="open-assignment"[^>]*data-assignment-id="legacy-score"/s,
  );
});

test("Piece Workspace is focus-mode with explicit back and capability-driven views", () => {
  const html = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.PIECE_WORKSPACE,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    chordBoard: null,
    pieceWorkspace: workspace("SCORE"),
  });

  assert.match(
    html,
    /data-action="back-from-piece"[^>]*>\s*←\s*Geri\s*<\/button>/,
  );
  assert.match(html, /<h1 id="piece-title">Cambaz<\/h1>/);
  assert.match(
    html,
    /class="piece-view-selector"[^>]*role="tablist"[^>]*aria-label="Çalışma görünümü"/,
  );
  assert.match(
    html,
    /data-action="select-piece-view"[^>]*data-piece-view="SCORE"[^>]*aria-selected="true"[^>]*>Nota<\/button>/s,
  );
  assert.match(
    html,
    /data-action="select-piece-view"[^>]*data-piece-view="CHORDS"[^>]*>Akorlar<\/button>/s,
  );
  assert.doesNotMatch(html, />TAB<\/button>/);
  assert.match(html, /<strong>Öğretmen notu<\/strong>/);
  assert.match(html, /Parçayı yavaş çalış\./);
  assert.match(html, /id="st-score-root"/);
  assert.doesNotMatch(html, /class="student-navigation"/);
});

test("Piece Akorlar view lists every authorized chord and reuses exact chord renderer", () => {
  const html = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.PIECE_WORKSPACE,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    chordBoard: null,
    pieceWorkspace: workspace("CHORDS"),
  });

  for (const id of [
    "chord-am",
    "chord-f",
  ]) {
    assert.match(
      html,
      new RegExp(
        `data-action="select-piece-chord"[^>]*data-assignment-id="${id}"`,
      ),
    );
  }
  assert.equal(
    (
      html.match(
        /data-action="select-piece-chord"/g,
      ) ?? []
    ).length,
    2,
  );

  assert.match(html, /<svg class="chord-diagram"/);
  assert.doesNotMatch(html, />Teller<\/h2>/);
  assert.doesNotMatch(html, />Bareler<\/h2>/);
  assert.match(
    html,
    /class="piece-score-panel"[^>]*hidden/s,
  );
});


test("Piece Workspace shows TAB between Nota and Akorlar when exact TAB MusicXML is available", () => {
  const base = workspace("SCORE");
  const pieceWorkspace = Object.freeze({
    ...base,
    selectedView: "TAB",
    availableViews: Object.freeze({
      score: true,
      tab: true,
      chords: true,
    }),
    score: Object.freeze({
      ...base.score,
      practice: Object.freeze({
        ...base.score.practice,
        capabilities: Object.freeze({
          ...base.score.practice.capabilities,
          guitarTab: "AVAILABLE",
        }),
      }),
    }),
  });

  const html = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.PIECE_WORKSPACE,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    chordBoard: null,
    pieceWorkspace,
  });

  const nota = html.indexOf(">Nota</button>");
  const tab = html.indexOf(">TAB</button>");
  const chords = html.indexOf(">Akorlar</button>");

  assert.ok(nota >= 0);
  assert.ok(tab > nota);
  assert.ok(chords > tab);
  assert.match(
    html,
    /data-piece-view="TAB"[^>]*aria-selected="true"/s,
  );
  assert.match(html, /<h2 id="notation-heading">TAB<\/h2>/);
  assert.match(html, /aria-label="TAB"/);
  assert.equal(
    (html.match(/id="st-score-root"/g) ?? []).length,
    1,
  );
});
