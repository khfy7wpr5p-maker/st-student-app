import test from "node:test";
import assert from "node:assert/strict";

import { createStNotationAdapter } from "../src/practice/notationAdapter.js";

function captureRuntime(calls) {
  return {
    async renderMusicXml(payload) {
      calls.push(payload);
    },
    async dispose() {},
  };
}

test("adds a runtime-only XML declaration to Smoosic-style score-partwise input", async () => {
  const calls = [];
  const originalMusicXml =
    '<score-partwise version="3.1"><part-list/></score-partwise>';
  const adapter = createStNotationAdapter({
    getRuntime: () => captureRuntime(calls),
  });

  await adapter.render({ musicXml: originalMusicXml });

  assert.equal(originalMusicXml.startsWith("<?xml"), false);
  assert.equal(
    calls[0].musicxml,
    '<?xml version="1.0" encoding="UTF-8"?>\n' + originalMusicXml,
  );
});

test("preserves an existing XML declaration exactly", async () => {
  const calls = [];
  const declaredMusicXml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0"><part-list/></score-partwise>';
  const adapter = createStNotationAdapter({
    getRuntime: () => captureRuntime(calls),
  });

  await adapter.render({ musicXml: declaredMusicXml });

  assert.equal(calls[0].musicxml, declaredMusicXml);
});

test("does not rewrite unsupported or malformed root shapes", async () => {
  for (const musicXml of [
    '<score-timewise version="3.1"/>',
    '<score-partwise/>',
    ' <score-partwise version="3.1"></score-partwise>',
  ]) {
    const calls = [];
    const adapter = createStNotationAdapter({
      getRuntime: () => captureRuntime(calls),
    });

    await adapter.render({ musicXml });

    assert.equal(calls[0].musicxml, musicXml);
  }
});
