import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("browser bootstrap routes violin audio through the existing Student playback scheduler", async () => {
  const source = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /createViolinAudioLane/);
  assert.match(
    source,
    /createViolinAudioLane\(\{[\s\S]*?runtimeLoader:\s*scoreAudioRuntimeLoader,[\s\S]*?audioContextFactory[\s\S]*?\}\)/,
  );
  assert.match(
    source,
    /createWebAudioPianoEngine\(\{[\s\S]*?noteRouter:\s*violinAudioLane[\s\S]*?\}\)/,
  );
  assert.match(
    source,
    /createStudentPlaybackPort\(\{[\s\S]*?violinAudioLane[\s\S]*?\}\)/,
  );
  assert.doesNotMatch(source, /setInterval\s*\([^)]*violin|violin[^\n]*setInterval/i);
  assert.doesNotMatch(source, /new\s+AudioContextCtor|new\s+(?:globalThis\.)?AudioContext/);
});
