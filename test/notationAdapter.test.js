import test from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_CAPABILITY_STATES } from "../src/practice/practiceCapabilities.js";
import {
  ST_SCORE_RENDERER_CONTRACT_VERSION,
  createStNotationAdapter,
} from "../src/practice/notationAdapter.js";

test("missing or malformed ST runtime is unavailable", () => {
  for (const runtime of [
    undefined,
    null,
    {},
    { renderMusicXml() {} },
    { dispose() {} },
  ]) {
    const adapter = createStNotationAdapter({
      getRuntime: () => runtime,
    });
    assert.equal(adapter.isAvailable(), false);
  }
});

test("adapter sends the pinned ST runtime payload", async () => {
  const calls = [];
  const runtime = {
    async renderMusicXml(payload) {
      calls.push(payload);
      return { contractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION };
    },
    async dispose() {},
  };
  const adapter = createStNotationAdapter({ getRuntime: () => runtime });

  const result = await adapter.render({
    musicXml: "<score-partwise/>",
  });

  assert.deepEqual(result, {
    capability: PRACTICE_CAPABILITY_STATES.AVAILABLE,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contractVersion, "0.2.0");
  assert.equal(calls[0].musicxml, "<score-partwise/>");
  assert.equal(calls[0].pageMode, "continuous");
  assert.equal(calls[0].autoResize, true);
  assert.equal(calls[0].drawTitle, false);
  assert.equal(calls[0].drawComposer, false);
  assert.match(calls[0].ticket, /^[1-9][0-9]{0,18}$/);
  assert.deepEqual(Object.keys(calls[0]).sort(), [
    "autoResize",
    "contractVersion",
    "drawComposer",
    "drawTitle",
    "musicxml",
    "pageMode",
    "ticket",
  ]);
});

test("adapter increments bounded render ticket per request", async () => {
  const tickets = [];
  const adapter = createStNotationAdapter({
    getRuntime: () => ({
      async renderMusicXml(payload) {
        tickets.push(payload.ticket);
      },
      async dispose() {},
    }),
  });

  await adapter.render({ musicXml: "<score-partwise/>" });
  await adapter.render({ musicXml: "<score-partwise/>" });

  assert.deepEqual(tickets, ["1", "2"]);
});

test("runtime failures become bounded ERROR without leaking exception data", async () => {
  const adapter = createStNotationAdapter({
    getRuntime: () => ({
      async renderMusicXml() {
        throw new Error("<score-partwise>SECRET</score-partwise>");
      },
      async dispose() {},
    }),
  });

  const result = await adapter.render({
    musicXml: "<score-partwise>SECRET</score-partwise>",
  });

  assert.deepEqual(result, {
    capability: PRACTICE_CAPABILITY_STATES.ERROR,
  });
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});

test("render becomes unavailable if runtime disappears", async () => {
  const adapter = createStNotationAdapter({
    getRuntime: () => undefined,
  });

  assert.deepEqual(
    await adapter.render({ musicXml: "<score-partwise/>" }),
    { capability: PRACTICE_CAPABILITY_STATES.UNAVAILABLE },
  );
});

test("dispose is safe without runtime and delegates when runtime exists", async () => {
  let disposeCalls = 0;

  const missing = createStNotationAdapter({
    getRuntime: () => undefined,
  });
  await missing.dispose();
  await missing.dispose();

  const present = createStNotationAdapter({
    getRuntime: () => ({
      async renderMusicXml() {},
      async dispose() {
        disposeCalls += 1;
      },
    }),
  });
  await present.dispose();

  assert.equal(disposeCalls, 1);
});

test("dispose swallows renderer disposal details", async () => {
  const adapter = createStNotationAdapter({
    getRuntime: () => ({
      async renderMusicXml() {},
      async dispose() {
        throw new Error("internal renderer secret");
      },
    }),
  });

  await assert.doesNotReject(() => adapter.dispose());
});


test("throwing runtime getter degrades to unavailable instead of escaping", async () => {
  const adapter = createStNotationAdapter({
    getRuntime() {
      throw new Error("host runtime lookup secret");
    },
  });

  assert.equal(adapter.isAvailable(), false);
  assert.deepEqual(
    await adapter.render({ musicXml: "<score-partwise/>" }),
    { capability: PRACTICE_CAPABILITY_STATES.UNAVAILABLE },
  );
  await assert.doesNotReject(() => adapter.dispose());
});
