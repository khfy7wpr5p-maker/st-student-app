import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

function state(screen) {
  return {
    student08: true,
    screen,
    session: { studentId: "student-a" },
    items: [],
    assignmentState: "ACTIVE",
    practice:
      screen === STUDENT_APP_SCREENS.PRACTICE
        ? {
            packageId: "pkg-a",
            title: "Etüt A",
            capabilities: {
              notation: "AVAILABLE",
              playback: "AVAILABLE",
              tempoChange: "AVAILABLE",
              measureRepeat: "AVAILABLE",
              guitarTab: "UNAVAILABLE",
              violin: "UNAVAILABLE",
            },
            practice: {
              tempoBpm: 80,
              measureRepeatEnabled: false,
            },
          }
        : null,
  };
}

test("mobile sidebar exposes short visible My Work text with the full accessible name", () => {
  const html = renderStudentApp(
    state(STUDENT_APP_SCREENS.MY_WORK),
  );

  assert.match(
    html,
    /data-action="show-my-work"[^>]*aria-label="Benim Çalışmalarım"[^>]*>/,
  );
  assert.match(
    html,
    /class="nav-label-full"[^>]*>Benim Çalışmalarım<\/span>/,
  );
  assert.match(
    html,
    /class="nav-label-short"[^>]*>Çalışmalar<\/span>/,
  );
});

test("Practice shell is explicitly marked so mobile layout can prioritize the score", () => {
  const html = renderStudentApp(
    state(STUDENT_APP_SCREENS.PRACTICE),
  );

  assert.match(
    html,
    /class="student-shell student-shell-practice"/,
  );
  assert.match(
    html,
    /id="st-score-root" role="region" aria-label="Nota"/,
  );
});

test("mobile sidebar labels do not break inside words", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation button\s*\{[^}]*white-space:\s*nowrap[^}]*overflow-wrap:\s*normal/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.nav-label-full\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.nav-label-short\s*\{[^}]*display:\s*inline/s,
  );
});

test("mobile Practice gives the notation workspace more width than the ordinary shell", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-shell-practice\s*\{[^}]*grid-template-columns:\s*minmax\(4\.75rem,\s*20%\)\s+minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-shell-practice \.student-content\s*\{[^}]*padding-left:\s*var\(--st-space-2\)[^}]*padding-right:\s*var\(--st-space-2\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-shell-practice \.practice-notation\s*\{[^}]*padding:\s*var\(--st-space-2\)/s,
  );
});
