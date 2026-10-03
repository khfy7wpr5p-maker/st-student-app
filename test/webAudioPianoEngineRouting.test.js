import test from "node:test";
import assert from "node:assert/strict";

import { createWebAudioPianoEngine } from "../src/playback/webAudioPianoEngine.js";

function makePlan({ notes = null } = {}) {
  return Object.freeze({
    schemaVersion: 1,
    quality: "APPROXIMATE",
    packageId: "pkg-route",
    referenceTempoBpm: 120,
    tempoMap: Object.freeze([Object.freeze({ beat: 0, bpm: 120 })]),
    measures: Object.freeze([
      Object.freeze({ index: 0, startBeat: 0, endBeat: 4 }),
    ]),
    notes:
      notes ??
      Object.freeze([
        Object.freeze({
          startBeat: 0,
          durationBeats: 1,
          midi: 66,
          measureIndex: 0,
          partId: "P1",
          voice: "1",
        }),
      ]),
  });
}

function makeClock() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    setInterval(fn) {
      const id = nextId++;
      callbacks.set(id, fn);
      return id;
    },
    clearInterval(id) {
      callbacks.delete(id);
    },
    tick() {
      for (const fn of [...callbacks.values()]) fn();
    },
  };
}

function makeAudioContext(currentTime = 0) {
  const sources = [];
  return {
    currentTime,
    destination: {},
    async resume() {},
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
      };
    },
    createBufferSource() {
      const source = {
        buffer: null,
        playbackRate: { value: 1 },
        starts: [],
        stops: [],
        connect() {},
        start(...args) {
          this.starts.push(args);
        },
        stop(...args) {
          this.stops.push(args);
        },
      };
      sources.push(source);
      return source;
    },
    sources,
  };
}

function makeSampleBank() {
  return {
    isConfigured() {
      return true;
    },
    async load() {},
    resolveMidi(midi) {
      return { buffer: { midi }, playbackRate: 1, referenceMidi: midi };
    },
  };
}

function makeRouter(mode = "PIANO") {
  const calls = [];
  const stops = [];
  return {
    calls,
    stops,
    routeNote(request) {
      calls.push(request);
      return mode;
    },
    stopAll(request) {
      stops.push(request);
    },
  };
}

test("EXTERNAL receives the scheduler absolute time and skips the piano source", async () => {
  const context = makeAudioContext(4);
  const router = makeRouter("EXTERNAL");
  const plan = makePlan();
  const note = plan.notes[0];
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    noteRouter: router,
    clock: makeClock(),
  });

  await engine.play({ plan, tempoBpm: 120, routingGeneration: 17 });

  assert.equal(context.sources.length, 0);
  assert.equal(router.calls.length, 1);
  assert.deepEqual(router.calls[0], {
    note,
    startTimeSeconds: 4,
    durationSeconds: 0.5,
    generation: 17,
  });
});

test("PIANO keeps the existing source path while SUPPRESS emits no piano source", async () => {
  for (const [mode, expectedSources] of [["PIANO", 1], ["SUPPRESS", 0]]) {
    const context = makeAudioContext();
    const router = makeRouter(mode);
    const engine = createWebAudioPianoEngine({
      audioContextFactory: () => context,
      sampleBank: makeSampleBank(),
      noteRouter: router,
      clock: makeClock(),
    });

    await engine.play({
      plan: makePlan(),
      tempoBpm: 120,
      routingGeneration: 3,
    });

    assert.equal(router.calls.length, 1, mode);
    assert.equal(context.sources.length, expectedSources, mode);
  }
});

test("pause restart and tempo re-anchor stop the external lane and keep one routing generation", async () => {
  const context = makeAudioContext();
  const router = makeRouter("EXTERNAL");
  const plan = makePlan();
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    noteRouter: router,
    clock: makeClock(),
  });

  await engine.play({ plan, tempoBpm: 120, routingGeneration: 9 });
  context.currentTime = 0.1;
  engine.pause();
  await engine.restart();
  engine.setTempo(60);

  assert.ok(router.stops.length >= 3);
  assert.ok(router.stops.every((value) => value?.generation === 9));
  assert.ok(router.calls.length >= 2);
  assert.ok(router.calls.every((value) => value.generation === 9));
  assert.equal(context.sources.length, 0);
});

test("range routing uses the clipped scheduler duration without inventing a second timer", async () => {
  const context = makeAudioContext();
  const clock = makeClock();
  const router = makeRouter("EXTERNAL");
  const notes = Object.freeze([
    Object.freeze({
      startBeat: 1,
      durationBeats: 2,
      midi: 66,
      measureIndex: 0,
      partId: "P1",
      voice: "1",
    }),
  ]);
  const plan = makePlan({ notes });
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    noteRouter: router,
    clock,
  });

  await engine.playRange({
    plan,
    tempoBpm: 120,
    startBeat: 2,
    endBeat: 3,
    routingGeneration: 21,
  });

  assert.equal(router.calls.length, 1);
  assert.equal(router.calls[0].note, notes[0]);
  assert.equal(router.calls[0].startTimeSeconds, 0);
  assert.equal(router.calls[0].durationSeconds, 0.5);
  assert.equal(router.calls[0].generation, 21);
  assert.equal(context.sources.length, 0);
});
