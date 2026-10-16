import test from "node:test";
import assert from "node:assert/strict";

import { createScoreAudioVoiceAdapter } from "../src/playback/scoreAudioVoiceAdapter.js";

function harness({ version = "0.2.0", withSampleProvider = false } = {}) {
  const calls = [];
  const fetched = [];
  const context = { currentTime: 12 };
  const engine = {
    async setInstrument(value) { calls.push(["instrument", value]); },
    async prepare() { calls.push(["prepare"]); },
    async unlockFromUserGesture() {
      calls.push(["unlock"]);
      return { ok: true };
    },
    async preparePitches(value) {
      calls.push(["pitches", value]);
      return { ok: true };
    },
    async scheduleNote(value) {
      calls.push(["note", value]);
      return { ok: true, requestId: value.requestId };
    },
    stopAll() { calls.push(["stopAll"]); },
  };
  const runtime = {
    version,
    createAudioEngine(options) {
      calls.push(["create", options]);
      return engine;
    },
  };
  if (withSampleProvider) {
    runtime.ManifestSampleProvider = class {
      constructor(manifests, options) {
        calls.push(["provider", manifests, options]);
      }
    };
    runtime.SALAMANDER_GRAND_PIANO_MANIFEST = { id: "piano" };
    runtime.FREEPATS_CLASSICAL_GUITAR_MANIFEST = { id: "guitar" };
    runtime.VSCO2CE_SOLO_VIOLIN_ARCO_VIB_MANIFEST = { id: "violin" };
  }
  return {
    calls,
    context,
    fetched,
    adapter: createScoreAudioVoiceAdapter({
      runtime,
      audioContextFactory: () => context,
      fetchImpl: async (url) => {
        fetched.push(url);
        return { ok: true };
      },
    }),
  };
}

test("adapter pins runtime 0.2.0 and binds the external shared AudioContext", async () => {
  const { adapter, calls, context } = harness();
  assert.equal(adapter.isSupported("VIOLIN"), true);

  await adapter.prepare({
    instrumentId: "VIOLIN",
    pitches: [60, 64, 60],
  });

  const options = calls.find(([name]) => name === "create")[1];
  assert.equal(options.audioContextFactory(), context);
  assert.equal(options.audioContextOwnership, "external");
  assert.deepEqual(
    calls.find(([name]) => name === "pitches")[1],
    {
      instrumentId: "VIOLIN",
      pitches: [{ midi: 60 }, { midi: 64 }],
    },
  );
});

test("adapter forwards absolute schedule time and bounded duration", async () => {
  const { adapter, calls } = harness();
  await adapter.prepare({ instrumentId: "VIOLIN", pitches: [60] });
  adapter.scheduleNote({
    requestId: "pkg:g1:0",
    sourceRevisionId: "rev-a",
    instrumentId: "VIOLIN",
    midi: 60,
    startTimeSeconds: 14.25,
    durationSeconds: 0.5,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    calls.find(([name]) => name === "note")[1],
    {
      requestId: "pkg:g1:0",
      sourceRevisionId: "rev-a",
      instrumentId: "VIOLIN",
      pitch: { midi: 60 },
      startTimeSeconds: 14.25,
      durationMs: 500,
    },
  );
});

test("adapter percent-encodes sharp sample filenames at the runtime fetch boundary", async () => {
  const { adapter, calls, fetched } = harness({ withSampleProvider: true });

  await adapter.prepare({ instrumentId: "CLASSICAL_GUITAR", pitches: [66] });

  const providerOptions = calls.find(([name]) => name === "provider")[2];
  await providerOptions.fetcher("https://example.invalid/samples/F#4.flac");
  assert.deepEqual(fetched, ["https://example.invalid/samples/F%234.flac"]);
  const engineOptions = calls.find(([name]) => name === "create")[1];
  assert.ok(engineOptions.sampleProvider);
});

test("adapter fails closed for an unpinned runtime or unsupported instrument", () => {
  assert.equal(harness({ version: "0.1.0" }).adapter.isSupported("VIOLIN"), false);
  assert.equal(harness().adapter.isSupported("CLASSICAL_GUITAR"), true);
  assert.equal(harness().adapter.isSupported("GRAND_PIANO"), true);
  assert.equal(harness().adapter.isSupported("RANDOM_INSTRUMENT"), false);
});
