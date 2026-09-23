import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PRACTICE_CAPABILITY_STATES } from "../src/practice/practiceCapabilities.js";
import { renderPracticeWorkspace } from "../src/ui/renderPracticeWorkspace.js";

function practice(overrides = {}) {
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
    ...overrides,
  };
}

test("S08-4B Practice keeps notation as the primary workspace and preserves the score root contract", () => {
  const html = renderPracticeWorkspace(practice(), { showHomeAction: false });

  assert.match(
    html,
    /<section class="practice-notation practice-primary" aria-labelledby="notation-heading">/,
  );
  assert.match(
    html,
    /<div id="st-score-root" class="practice-score-root" role="region" aria-label="Nota"><\/div>/,
  );
  assert.equal((html.match(/id="st-score-root"/g) ?? []).length, 1);
  assert.ok(
    html.indexOf('class="practice-notation practice-primary"') <
      html.indexOf('class="practice-playback practice-secondary"'),
  );
});

test("S08-4B Practice keeps playback actions compact and unchanged", () => {
  const html = renderPracticeWorkspace(practice(), { showHomeAction: false });

  assert.match(
    html,
    /<section class="practice-playback practice-secondary" aria-labelledby="playback-heading">/,
  );

  for (const [action, label] of [
    ["play-practice", "Dinle"],
    ["pause-practice", "Duraklat"],
    ["restart-practice", "Baştan"],
  ]) {
    assert.match(
      html,
      new RegExp(`data-action="${action}">${label}<`),
    );
  }
});

test("S08-4B Practice keeps tempo and repeat strictly capability-gated", () => {
  const unavailableHtml = renderPracticeWorkspace(
    practice({
      capabilities: {
        notation: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        playback: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        tempoChange: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        measureRepeat: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        guitarTab: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        violin: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
      },
    }),
    { showHomeAction: false },
  );

  assert.doesNotMatch(unavailableHtml, /data-practice-tempo/);
  assert.doesNotMatch(unavailableHtml, /data-action="set-practice-tempo"/);
  assert.doesNotMatch(unavailableHtml, /data-action="set-measure-repeat"/);

  const availableHtml = renderPracticeWorkspace(practice(), {
    showHomeAction: false,
  });

  assert.match(availableHtml, /data-practice-tempo/);
  assert.match(availableHtml, /data-action="set-practice-tempo"/);
  assert.match(availableHtml, /data-action="set-measure-repeat"/);
});

test("S08-4B Practice visual hierarchy keeps score full-width and controls secondary on mobile", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /\.practice-notation\s*\{[^}]*border-width:\s*2px[^}]*padding:\s*var\(--st-space-6\)/s,
  );
  assert.match(
    html,
    /\.practice-score-root\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%[^}]*overflow-x:\s*auto/s,
  );
  assert.match(
    html,
    /\.practice-playback\s*\{[^}]*background:\s*var\(--st-surface-panel\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.practice-notation\s*\{[^}]*padding:\s*var\(--st-space-3\)/s,
  );
});
