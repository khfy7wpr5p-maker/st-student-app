import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PRACTICE_CAPABILITY_STATES } from "../src/practice/practiceCapabilities.js";
import { renderPracticeWorkspace } from "../src/ui/renderPracticeWorkspace.js";

function practice() {
  return {
    title: "Piece Etüdü",
    playbackQuality: "APPROXIMATE",
    capabilities: {
      notation: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      playback: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      tempoChange: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      measureRepeat: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
      guitarTab: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
      violin: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    },
    practice: {
      tempoBpm: 60,
      measureRepeatEnabled: false,
    },
  };
}

test("playback toolbar uses compact icon controls with accessible names", () => {
  const html = renderPracticeWorkspace(practice(), {
    showHomeAction: false,
    showTitle: false,
  });

  assert.match(html, /class="practice-playback-toolbar"/);
  assert.match(
    html,
    /data-action="play-practice"[\s\S]*?aria-label="Dinle"[\s\S]*?title="Dinle"[\s\S]*?▶/,
  );
  assert.match(
    html,
    /data-action="pause-practice"[\s\S]*?aria-label="Duraklat"[\s\S]*?title="Duraklat"[\s\S]*?⏸/,
  );
  assert.match(
    html,
    /data-action="restart-practice"[\s\S]*?aria-label="Baştan"[\s\S]*?title="Baştan"[\s\S]*?↺/,
  );
  assert.doesNotMatch(
    html,
    /data-action="play-practice"[^>]*>\s*Dinle\s*<\/button>/,
  );
});

test("tempo stays visible inside the compact playback toolbar", () => {
  const html = renderPracticeWorkspace(practice(), {
    showHomeAction: false,
    showTitle: false,
  });

  assert.match(html, /class="practice-tempo"/);
  assert.match(html, /data-practice-tempo/);
  assert.match(html, /value="60"/);
  assert.match(html, />BPM</);
  assert.match(
    html,
    /data-action="set-practice-tempo"[\s\S]*?aria-label="Tempoyu uygula"[\s\S]*?✓/,
  );
});

test("mobile CSS keeps playback controls compact instead of full-width stacked buttons", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /\.practice-playback-toolbar\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/s,
  );
  assert.match(
    html,
    /\.practice-control-button,[\s\S]*?\.practice-tempo-apply\s*\{[^}]*width:\s*2\.75rem[^}]*min-height:\s*2\.75rem[^}]*padding:\s*0/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.practice-playback-controls\s*\{[^}]*display:\s*flex[^}]*grid-template-columns:\s*none/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.practice-tempo\s*\{[^}]*display:\s*flex/s,
  );
});
