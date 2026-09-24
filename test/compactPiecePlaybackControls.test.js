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
    /data-action="play-practice"[^>]*aria-label="Dinle"[^>]*title="Dinle"[^>]*>[sS]*?▶/,
  );
  assert.match(
    html,
    /data-action="pause-practice"[^>]*aria-label="Duraklat"[^>]*title="Duraklat"[^>]*>[sS]*?⏸/,
  );
  assert.match(
    html,
    /data-action="restart-practice"[^>]*aria-label="Baştan"[^>]*title="Baştan"[^>]*>[sS]*?↺/,
  );
  assert.doesNotMatch(
    html,
    /data-action="play-practice"[^>]*>s*Dinles*</button>/,
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
    /data-action="set-practice-tempo"[^>]*aria-label="Tempoyu uygula"[^>]*>[sS]*?✓/,
  );
});

test("mobile CSS keeps playback controls compact instead of full-width stacked buttons", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /.practice-playback-toolbars*{[^}]*display:s*flex[^}]*align-items:s*center/s,
  );
  assert.match(
    html,
    /.practice-control-buttons*{[^}]*width:s*2.75rem[^}]*min-height:s*2.75rem[^}]*padding:s*0/s,
  );
  assert.match(
    html,
    /@medias*(max-width:s*640px)[sS]*?.practice-playback-controlss*{[^}]*display:s*flex[^}]*grid-template-columns:s*none/s,
  );
  assert.match(
    html,
    /@medias*(max-width:s*640px)[sS]*?.practice-tempos*{[^}]*display:s*flex/s,
  );
});
