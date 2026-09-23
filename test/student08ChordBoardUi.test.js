import test from "node:test";
import assert from "node:assert/strict";

import {
  STUDENT_APP_SCREENS,
} from "../src/ui/studentAppController.js";
import {
  renderStudentApp,
} from "../src/ui/renderStudentApp.js";

function chordState() {
  return {
    student08: true,
    screen: STUDENT_APP_SCREENS.CHORD_BOARD,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    chordBoard: {
      packageId: "assignment-chord-a",
      title: "Am Akor Çalışması",
      teacherNote: "60 BPM ile çalış.",
      chord: {
        displaySymbol: "Am",
        displayRoot: "A",
      },
      strings: [
        {
          stringNumber: 6,
          fret: -1,
          state: "MUTED",
          finger: -1,
        },
        {
          stringNumber: 5,
          fret: 0,
          state: "OPEN",
          finger: 0,
        },
        {
          stringNumber: 4,
          fret: 2,
          state: "FRETTED",
          finger: 2,
        },
        {
          stringNumber: 3,
          fret: 2,
          state: "FRETTED",
          finger: 3,
        },
        {
          stringNumber: 2,
          fret: 1,
          state: "FRETTED",
          finger: 1,
        },
        {
          stringNumber: 1,
          fret: 0,
          state: "OPEN",
          finger: 0,
        },
      ],
      barres: [
        {
          finger: 1,
          fret: 5,
          fromString: 6,
          toString: 1,
        },
      ],
      offlineAvailable: true,
      offlineSaveFailed: false,
    },
  };
}

test("CHORD_BOARD screen renders exact student-safe chord identity and six strings", () => {
  const html = renderStudentApp(
    chordState(),
  );

  assert.match(
    html,
    /<section class="chord-board-workspace" role="region" aria-label="Akor çalışması">/,
  );
  assert.match(
    html,
    /<h1[^>]*>Am<\/h1>/,
  );
  assert.match(
    html,
    /class="chord-board-work-title">Am Akor Çalışması/,
  );
  assert.match(
    html,
    /<ol class="chord-string-list" aria-label="Gitar telleri">/,
  );

  for (const expected of [
    "6. tel: kapalı.",
    "5. tel: açık.",
    "4. tel: 2. perde, 2. parmak.",
    "3. tel: 2. perde, 3. parmak.",
    "2. tel: 1. perde, 1. parmak.",
    "1. tel: açık.",
  ]) {
    assert.match(html, new RegExp(expected));
  }

  assert.match(
    html,
    /data-string-number="4"[^>]*data-fret="2"[^>]*data-finger="2"/s,
  );
});

test("CHORD_BOARD screen exposes exact barre and teacher note accessibly", () => {
  const html = renderStudentApp(
    chordState(),
  );

  assert.match(
    html,
    /1\. parmak bare: 5\. perde, 6\. telden 1\. tele\./,
  );
  assert.match(
    html,
    /Öğretmen notu/,
  );
  assert.match(
    html,
    /60 BPM ile çalış\./,
  );
  assert.match(
    html,
    /class="offline-availability">Cihazda mevcut/,
  );
});

test("CHORD_BOARD screen never exposes SCORE controls or internal package authority", () => {
  const html = renderStudentApp(
    chordState(),
  );

  for (const forbidden of [
    "st-score-root",
    "play-practice",
    "pause-practice",
    "restart-practice",
    "tempoBpm",
    "voicingFingerprint",
    "catalogFingerprint",
    "sourceRepository",
    "recipientStudentId",
  ]) {
    assert.equal(
      html.includes(forbidden),
      false,
      forbidden,
    );
  }
});
