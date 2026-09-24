import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

function myWorkState(items, assignmentState = ASSIGNMENT_STATES.ACTIVE) {
  return {
    student08: true,
    screen: STUDENT_APP_SCREENS.MY_WORK,
    session: { studentId: "student-a" },
    assignmentState,
    items,
    practice: null,
  };
}

test("S08-4B My Work gives SCORE items a clear hierarchy while preserving the existing open action", () => {
  const html = renderStudentApp(
    myWorkState([
      {
        assignmentId: "score-1",
        title: "Gitar Etüdü",
        practiceType: PRACTICE_TYPES.SCORE,
        teacherNote: "İkinci ölçüyü yavaş çalış.",
        state: ASSIGNMENT_STATES.ACTIVE,
        assignedAt: "2026-09-22T16:00:00Z",
      },
    ]),
  );

  assert.match(
    html,
    /<article class="assignment-card assignment-card-score">/,
  );
  assert.match(html, /class="assignment-type">Nota çalışması/);
  assert.match(
    html,
    /class="teacher-note"><span class="teacher-note-label">Öğretmen notu<\/span>İkinci ölçüyü yavaş çalış\./,
  );
  assert.match(
    html,
    /data-action="open-assignment"[^>]*data-assignment-id="score-1"/s,
  );
});

test("S08-4B My Work groups CHORD_BOARD assignments under one expandable Akor çalışması entry", () => {
  const html = renderStudentApp(
    myWorkState([
      {
        assignmentId: "score-1",
        title: "Gitar Etüdü",
        practiceType: PRACTICE_TYPES.SCORE,
        teacherNote: "",
        state: ASSIGNMENT_STATES.ACTIVE,
        assignedAt: "2026-09-22T16:00:00Z",
      },
      {
        assignmentId: "chord-1",
        title: "Am",
        practiceType: PRACTICE_TYPES.CHORD_BOARD,
        teacherNote: "Parmakları sırayla yerleştir.",
        state: ASSIGNMENT_STATES.ACTIVE,
        assignedAt: "2026-09-22T16:05:00Z",
      },
      {
        assignmentId: "chord-2",
        title: "F",
        practiceType: PRACTICE_TYPES.CHORD_BOARD,
        teacherNote: "Bareyi temiz bas.",
        state: ASSIGNMENT_STATES.ACTIVE,
        assignedAt: "2026-09-22T16:06:00Z",
      },
    ]),
  );

  assert.match(
    html,
    /<details class="chord-assignment-group">/,
  );
  assert.match(
    html,
    /<summary[^>]*>\s*<span[^>]*>Akor çalışması<\/span>[\s\S]*?<span[^>]*>2 akor<\/span>/,
  );
  assert.equal(
    (html.match(/class="chord-assignment-group"/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    html,
    /assignment-card-chord-board/,
  );

  for (const [assignmentId, title] of [
    ["chord-1", "Am"],
    ["chord-2", "F"],
  ]) {
    assert.match(
      html,
      new RegExp(
        `data-action="open-assignment"[^>]*data-assignment-id="${assignmentId}"[\\s\\S]*?>[\\s\\S]*?${title}[\\s\\S]*?<\\/button>`,
      ),
    );
  }

  assert.doesNotMatch(
    html,
    /Bu akor çalışması henüz kullanıma hazır değil/,
  );
  assert.doesNotMatch(html, />\s*(?:Düzenle|Çal|Dinle)\s*</);
});

test("S08-4B My Work folders are compact, visibly selected, and responsive", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /\.work-folders\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[^}]*gap:\s*var\(--st-space-2\)/s,
  );
  assert.match(
    html,
    /\.work-folders button\[aria-pressed="true"\]\s*\{[^}]*border-width:\s*2px[^}]*text-decoration:\s*underline/s,
  );
  assert.match(
    html,
    /\.assignment-list\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*18rem\),\s*1fr\)\)/s,
  );
  assert.match(
    html,
    /\.teacher-note\s*\{[^}]*color:\s*var\(--st-text-muted\)[^}]*font-size:\s*var\(--st-font-size-sm\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.work-folders button\s*\{[^}]*min-width:\s*0[^}]*font-size:\s*var\(--st-font-size-sm\)/s,
  );
});

test("S08-4B My Work keeps exact lifecycle folder semantics", () => {
  const html = renderStudentApp(
    myWorkState([], ASSIGNMENT_STATES.COMPLETED),
  );

  for (const [state, label] of [
    [ASSIGNMENT_STATES.ACTIVE, "Aktif Çalışmalar"],
    [ASSIGNMENT_STATES.COMPLETED, "Bitmiş Çalışmalar"],
    [ASSIGNMENT_STATES.REPERTOIRE, "Repertuarım"],
  ]) {
    assert.match(
      html,
      new RegExp(
        `data-action="show-work-folder"\\s+data-assignment-state="${state}"[\\s\\S]*?>${label}<`,
      ),
    );
  }

  assert.match(
    html,
    /data-assignment-state="COMPLETED"[\s\S]*?aria-pressed="true"/,
  );
});
