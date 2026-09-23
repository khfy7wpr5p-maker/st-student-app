import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

function student08State(screen) {
  return {
    student08: true,
    screen,
    session: { studentId: "student-a" },
    items: [],
    practice:
      screen === STUDENT_APP_SCREENS.PRACTICE
        ? {
            packageId: "pkg-a",
            title: "Etüt A",
            capabilities: {
              notation: "UNAVAILABLE",
              playback: "UNAVAILABLE",
              tempoChange: "UNAVAILABLE",
              measureRepeat: "UNAVAILABLE",
              guitarTab: "UNAVAILABLE",
              violin: "UNAVAILABLE",
            },
            practice: { tempoBpm: 80 },
          }
        : null,
    assignmentState: "ACTIVE",
  };
}

test("S08-4B mobile navigation exposes the current student section to VoiceOver", () => {
  const pool = renderStudentApp(
    student08State(STUDENT_APP_SCREENS.PUBLIC_POOL),
  );
  assert.match(
    pool,
    /aria-current="page" data-action="show-public-pool">Havuz/,
  );
  assert.doesNotMatch(
    pool,
    /aria-current="page" data-action="show-my-work"/,
  );

  const work = renderStudentApp(
    student08State(STUDENT_APP_SCREENS.MY_WORK),
  );
  assert.match(
    work,
    /aria-current="page" data-action="show-my-work">Benim Çalışmalarım/,
  );

  const practice = renderStudentApp(
    student08State(STUDENT_APP_SCREENS.PRACTICE),
  );
  assert.match(
    practice,
    /aria-current="page" data-action="show-my-work">Benim Çalışmalarım/,
  );
});

test("S08-4C mobile navigation keeps persistent sidebar access to Pool, My Work, and Sign Out", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation\s+nav\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation\s+button\s*\{[^}]*font-size:\s*var\(--st-font-size-sm\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation\s+button\s*\{[^}]*min-width:\s*0/s,
  );
});

test("S08-4C mobile sidebar uses safe-area-aware sticky presentation without reducing touch targets", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation\s*\{[^}]*position:\s*sticky[^}]*top:\s*env\(safe-area-inset-top,\s*0px\)[^}]*z-index:/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?#app:has\(\.student-shell\)\s*\{[^}]*padding-left:\s*max\([^;]*env\(safe-area-inset-left,\s*0px\)[^;]*\)[^}]*padding-right:\s*max\([^;]*env\(safe-area-inset-right,\s*0px\)[^;]*\)/s,
  );
  assert.match(html, /button\s*\{[^}]*min-height:\s*3rem/s);
});
