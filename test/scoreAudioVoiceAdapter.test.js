import '../vendor/st-score-audio/st-score-audio-engine.js';
import test from "node:test";
import assert from "node:assert/strict";

import { createScoreAudioVoiceAdapter } from "../src/playback/scoreAudioVoiceAdapter.js";

function harness({ version = "0.3.0", withSampleProvider = false } = {}) {
  const calls = [];
  const fetched = [];
  const context = { currentTime: 12, destination: {}, createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {} }; }, createGain() { return { context: this, gain: { value: 1 }, connect() {} }; } };
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
    ...globalThis.STScoreAudioEngine,
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

test("adapter pins runtime 0.3.0 and binds the external shared AudioContext", async () => {
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

test('adapter forwards explicit musical velocity including zero', async()=>{
 const {adapter,calls}=harness();await adapter.prepare({instrumentId:'VIOLIN',pitches:[60]});
 for(const velocity of [0,.3,1]){
  adapter.scheduleNote({requestId:String(velocity),sourceRevisionId:'rev',instrumentId:'VIOLIN',midi:60,startTimeSeconds:14,durationSeconds:.5,velocity});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(([name])=>name==='note').at(-1)[1].velocity,velocity);
 }
});

test('all calibrated lanes share a host output stage with measured overload protection',async()=>{
 const {adapter,calls}=harness();
 await adapter.prepare({instrumentId:'VIOLIN',pitches:[60]});
 await adapter.prepare({instrumentId:'GRAND_PIANO',pitches:[60]});
 const options=calls.filter(([name])=>name==='create').map(([,v])=>v);
 assert.equal(options[0].outputNode,options[1].outputNode);
 assert.equal(options[0].outputNode.gain.value,0.23534927701368785);
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

test("late native scheduling after stop cancels only its old request", async () => {
  let finish;
  const stopped = [], released = [];
  const engine = {
    async setInstrument() {}, async prepare() {},
    async unlockFromUserGesture() { return { ok: true }; },
    async preparePitches() { return { ok: true }; },
    scheduleNote(request) {
      return request.requestId === "old" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ ok: true });
    },
    stopAll() { stopped.push("all"); },
    noteOff(id) { released.push(id); },
  };
  const adapter = createScoreAudioVoiceAdapter({ runtime: { ...globalThis.STScoreAudioEngine, version: "0.3.0", createAudioEngine() { return engine; } }, audioContextFactory() { return { destination:{}, createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {} }; }, createGain() {return {gain:{value:1},connect(){}};} }; } });
  await adapter.prepare({ instrumentId: "VIOLIN", pitches: [60] });
  const note = { instrumentId: "VIOLIN", midi: 60, sourceRevisionId: "rev-a", startTimeSeconds: 1, durationSeconds: 1 };
  adapter.scheduleNote({ ...note, requestId: "old" });
  adapter.stopAll();
  adapter.scheduleNote({ ...note, requestId: "new" });
  finish({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(released, ["old"]);
  assert.deepEqual(stopped, ["all"]);
});
