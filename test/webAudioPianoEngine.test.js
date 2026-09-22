import test from "node:test";
import assert from "node:assert/strict";

import { createWebAudioPianoEngine } from "../src/playback/webAudioPianoEngine.js";

function makePlan() {
  return Object.freeze({
    schemaVersion: 1,
    quality: "APPROXIMATE",
    packageId: "pkg-a",
    referenceTempoBpm: 120,
    tempoMap: Object.freeze([
      Object.freeze({ beat: 0, bpm: 120 }),
      Object.freeze({ beat: 4, bpm: 60 }),
    ]),
    measures: Object.freeze([
      Object.freeze({ index: 0, startBeat: 0, endBeat: 4 }),
      Object.freeze({ index: 1, startBeat: 4, endBeat: 8 }),
    ]),
    notes: Object.freeze([
      Object.freeze({ startBeat: 0, durationBeats: 1, midi: 60, measureIndex: 0, partId: "P1", voice: "1" }),
      Object.freeze({ startBeat: 2, durationBeats: 1, midi: 62, measureIndex: 0, partId: "P1", voice: "1" }),
      Object.freeze({ startBeat: 4, durationBeats: 1, midi: 64, measureIndex: 1, partId: "P1", voice: "1" }),
      Object.freeze({ startBeat: 6, durationBeats: 1, midi: 65, measureIndex: 1, partId: "P1", voice: "1" }),
    ]),
  });
}

function makeClock() {
  let nextId = 1;
  const callbacks = new Map();

  return {
    setInterval(fn, ms) {
      const id = nextId++;
      callbacks.set(id, { fn, ms });
      return id;
    },
    clearInterval(id) {
      callbacks.delete(id);
    },
    tick() {
      for (const { fn } of [...callbacks.values()]) {
        fn();
      }
    },
    get activeCount() {
      return callbacks.size;
    },
  };
}

function makeAudioContext() {
  const sources = [];
  const gains = [];

  const context = {
    currentTime: 0,
    destination: { kind: "destination" },
    resumeCount: 0,
    async resume() {
      this.resumeCount += 1;
    },
    createGain() {
      const events = [];
      const node = {
        connectedTo: null,
        connect(target) {
          this.connectedTo = target;
        },
        gain: {
          value: 1,
          setValueAtTime(value, when) {
            events.push(["set", value, when]);
          },
          linearRampToValueAtTime(value, when) {
            events.push(["ramp", value, when]);
          },
        },
        events,
      };
      gains.push(node);
      return node;
    },
    createBufferSource() {
      const node = {
        buffer: null,
        playbackRate: { value: 1 },
        connectedTo: null,
        starts: [],
        stops: [],
        connect(target) {
          this.connectedTo = target;
        },
        start(...args) {
          this.starts.push(args);
        },
        stop(...args) {
          this.stops.push(args);
        },
      };
      sources.push(node);
      return node;
    },
    sources,
    gains,
  };

  return context;
}

function makeSampleBank() {
  return {
    loadCount: 0,
    isConfigured() {
      return true;
    },
    async load() {
      this.loadCount += 1;
    },
    resolveMidi(midi) {
      return {
        buffer: { midi },
        playbackRate: midi === 65 ? 2 : 1,
        referenceMidi: midi === 65 ? 53 : midi,
      };
    },
  };
}

test("engine support check does not create AudioContext", () => {
  let created = 0;
  const sampleBank = makeSampleBank();
  const engine = createWebAudioPianoEngine({
    audioContextFactory() {
      created += 1;
      return makeAudioContext();
    },
    sampleBank,
    clock: makeClock(),
  });

  assert.equal(engine.isSupported(), true);
  assert.equal(created, 0);
});

test("tempo map schedules beat 0/2/4/6 at 0/1/2/4 seconds", async () => {
  const context = makeAudioContext();
  const clock = makeClock();
  const sampleBank = makeSampleBank();
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank,
    clock,
  });

  await engine.play({ plan: makePlan(), tempoBpm: 120 });
  assert.equal(context.resumeCount, 1);
  assert.equal(sampleBank.loadCount, 1);
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0].starts[0][0], 0);

  context.currentTime = 0.8;
  clock.tick();
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[1].starts[0][0], 1);

  context.currentTime = 1.8;
  clock.tick();
  assert.equal(context.sources.length, 3);
  assert.equal(context.sources[2].starts[0][0], 2);

  context.currentTime = 3.8;
  clock.tick();
  assert.equal(context.sources.length, 4);
  assert.equal(context.sources[3].starts[0][0], 4);
});

test("selected tempo scales timing without changing sample playbackRate", async () => {
  const context = makeAudioContext();
  const clock = makeClock();
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    clock,
  });

  await engine.play({ plan: makePlan(), tempoBpm: 60 });

  context.currentTime = 1.8;
  clock.tick();
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[1].starts[0][0], 2);

  context.currentTime = 7.8;
  clock.tick();
  assert.equal(context.sources.length, 4);
  const fSource = context.sources.find((source) => source.buffer.midi === 65);
  assert.equal(fSource.starts[0][0], 8);
  assert.equal(fSource.playbackRate.value, 2);
});

test("pause preserves musical beat and play resumes without duplicate schedulers", async () => {
  const context = makeAudioContext();
  const clock = makeClock();
  const plan = makePlan();
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    clock,
  });

  await engine.play({ plan, tempoBpm: 120 });
  assert.equal(clock.activeCount, 1);

  await engine.play({ plan, tempoBpm: 120 });
  assert.equal(clock.activeCount, 1);

  context.currentTime = 0.75;
  engine.pause();
  assert.ok(Math.abs(engine.getCurrentBeat() - 1.5) < 1e-9);
  assert.equal(clock.activeCount, 0);
  assert.ok(context.sources.every((source) => source.stops.length >= 1));

  await engine.play({ plan, tempoBpm: 120 });
  assert.ok(Math.abs(engine.getCurrentBeat() - 1.5) < 1e-9);
  assert.equal(clock.activeCount, 1);
});

test("restart resets score beat to zero and starts from zero", async () => {
  const context = makeAudioContext();
  const clock = makeClock();
  const plan = makePlan();
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    clock,
  });

  await engine.play({ plan, tempoBpm: 120 });
  context.currentTime = 0.75;
  engine.pause();
  assert.ok(engine.getCurrentBeat() > 1);

  await engine.restart();

  assert.equal(engine.getCurrentBeat(), 0);
  assert.equal(clock.activeCount, 1);
  const lastSource = context.sources.at(-1);
  assert.equal(lastSource.buffer.midi, 60);
  assert.equal(lastSource.starts[0][0], context.currentTime);
});

test("starting a different plan stops sources from previous plan", async () => {
  const context = makeAudioContext();
  const clock = makeClock();
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    clock,
  });
  const first = makePlan();
  const second = Object.freeze({
    ...makePlan(),
    packageId: "pkg-b",
    notes: Object.freeze([
      Object.freeze({ startBeat: 0, durationBeats: 1, midi: 67, measureIndex: 0, partId: "P1", voice: "1" }),
    ]),
  });

  await engine.play({ plan: first, tempoBpm: 120 });
  const oldSource = context.sources[0];

  await engine.play({ plan: second, tempoBpm: 120 });

  assert.ok(oldSource.stops.length >= 1);
  assert.equal(context.sources.at(-1).buffer.midi, 67);
  assert.equal(clock.activeCount, 1);
});

test("note scheduling creates click-safe envelope and conservative master gain", async () => {
  const context = makeAudioContext();
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => context,
    sampleBank: makeSampleBank(),
    clock: makeClock(),
  });

  await engine.play({ plan: makePlan(), tempoBpm: 120 });

  const master = context.gains[0];
  const noteGain = context.gains[1];
  assert.equal(master.gain.value, 0.16);
  assert.deepEqual(noteGain.events[0], ["set", 0, 0]);
  assert.deepEqual(noteGain.events[1], ["ramp", 1, 0.005]);
  assert.equal(noteGain.events.at(-1)[0], "ramp");
  assert.equal(noteGain.events.at(-1)[1], 0);
});
