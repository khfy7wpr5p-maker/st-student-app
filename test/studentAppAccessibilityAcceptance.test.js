import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CONNECTIVITY_STATES } from "../src/offline/connectivityPort.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

test("iPhone shell preserves zoom, large touch targets, and visible focus", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /<html lang="tr">/);
  assert.match(
    html,
    /<meta name="viewport" content="width=device-width, initial-scale=1">/,
  );
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
  assert.match(html, /button\s*\{[^}]*min-height:\s*3rem/s);
  assert.match(html, /button:focus-visible\s*\{[^}]*outline:/s);
});

test("VoiceOver receives a bounded live connectivity status", () => {
  const html = renderStudentApp(
    {
      screen: STUDENT_APP_SCREENS.HOME,
      session: { studentId: "student-a" },
      items: [],
      practice: null,
    },
    { connectivityState: CONNECTIVITY_STATES.OFFLINE },
  );

  assert.match(
    html,
    /class="app-status" role="status" aria-live="polite">Çevrimdışı<\/div>/,
  );
  assert.doesNotMatch(html, />student-a<|["\']student-a["\']|firebase|token|indexeddb/i);
});

test("Practice exposes semantic headings and a labeled notation region", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.PRACTICE,
    session: { studentId: "student-a" },
    items: [],
    practice: {
      publicationId: "pub-a",
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
      practice: { tempoBpm: 80 },
    },
  });

  assert.match(html, /<h1 id="page-title">Etüt A<\/h1>/);
  assert.match(html, /<h2 id="notation-heading">Nota<\/h2>/);
  assert.match(
    html,
    /id="st-score-root" role="region" aria-label="Nota"/,
  );
  assert.match(html, /<h2 id="playback-heading" class="sr-only">Dinleme<\/h2>/);
  assert.match(html, /<label for="practice-tempo">Tempo<\/label>/);
  assert.match(
    html,
    /<input type="checkbox" data-action="set-measure-repeat">/,
  );
});

test("primary student navigation uses native labeled controls", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.HOME,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
  });

  assert.match(
    html,
    /<button type="button" data-action="show-public-pool">Havuz<\/button>/,
  );
  assert.match(
    html,
    /<button type="button" data-action="show-my-work">Benim Çalışmalarım<\/button>/,
  );
  assert.match(
    html,
    /<button type="button" data-action="sign-out">Çıkış<\/button>/,
  );
  assert.doesNotMatch(html, /role="button"/);
});
