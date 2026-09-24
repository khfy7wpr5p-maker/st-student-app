import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PRACTICE_CAPABILITY_STATES } from "../src/practice/practiceCapabilities.js";
import { renderPracticeWorkspace } from "../src/ui/renderPracticeWorkspace.js";

function practice() {
  return {
    title: "Gitar Etüdü",
    capabilities: {
      notation: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      playback: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      tempoChange: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      measureRepeat: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      guitarTab: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
      violin: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    },
    practice: {
      tempoBpm: 80,
      measureRepeatEnabled: false,
    },
  };
}

test("S08-4B playback controls expose a bounded VoiceOver group label", () => {
  const html = renderPracticeWorkspace(practice(), {
    showHomeAction: false,
  });

  assert.match(
    html,
    /<div class="practice-playback-controls" role="group" aria-label="Dinleme kontrolleri">/,
  );
  assert.match(html, /data-action="play-practice">Dinle</);
  assert.match(html, /data-action="pause-practice">Duraklat</);
  assert.match(html, /data-action="restart-practice">Baştan</);
});

test("S08-4B long navigation and folder labels may wrap without horizontal overflow", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /\.student-navigation button,[\s\S]*?\.work-folders button\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*white-space:\s*normal/s,
  );
  assert.match(
    html,
    /\.practice-workspace,[\s\S]*?\.practice-notation\s*\{[^}]*min-width:\s*0/s,
  );
});

test("S08-4B repeat control preserves a large labeled touch target without stretching the checkbox", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /\.practice-repeat\s*\{[^}]*min-height:\s*3rem[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*var\(--st-space-2\)/s,
  );
  assert.match(
    html,
    /\.practice-repeat input\[type="checkbox"\]\s*\{[^}]*width:\s*1\.25rem[^}]*height:\s*1\.25rem[^}]*min-height:\s*1\.25rem[^}]*flex:\s*0 0 auto/s,
  );
});

test("S08-4C extra-narrow iPhone layout preserves safe areas inside the light sidebar shell", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*360px\)[\s\S]*?#app:has\(\.student-shell\)\s*\{[^}]*padding-left:\s*max\(0px,\s*env\(safe-area-inset-left,\s*0px\)\)[^}]*padding-right:\s*max\(0px,\s*env\(safe-area-inset-right,\s*0px\)\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*360px\)[\s\S]*?\.student-content\s*\{[^}]*env\(safe-area-inset-top,\s*0px\)[^}]*var\(--st-space-3\)[^}]*env\(safe-area-inset-bottom,\s*0px\)/s,
  );
});


test("CHORD_BOARD workspace stays bounded on phone widths without changing Practice layout", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /\.chord-board-workspace\s*\{[^}]*min-width:\s*0/s,
  );
  assert.match(
    html,
    /\.chord-diagram\s*\{[^}]*width:\s*min\(100%,\s*25rem\)[^}]*height:\s*auto[^}]*display:\s*block[^}]*overflow:\s*visible/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.chord-board-workspace\s*\{[^}]*padding-inline:\s*var\(--st-space-2\)/s,
  );
});
