import test from "node:test";
import assert from "node:assert/strict";

import { createWebAudioPianoEngine } from "../src/playback/webAudioPianoEngine.js";

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function plan(packageId, midi) {
  return Object.freeze({
    schemaVersion: 1,
    quality: "APPROXIMATE",
    packageId,
    referenceTempoBpm: 120,
    tempoMap: Object.freeze([Object.freeze({ beat: 0, bpm: 120 })]),
    measures: Object.freeze([
      Object.freeze({ index: 0, startBeat: 0, endBeat: 2 }),
    ]),
    notes: Object.freeze([
      Object.freeze({
        startBeat: 0,
        durationBeats: 1,
        midi,
        measureIndex: 0,
        partId: "P1",
        voice: "1",
      }),
    ]),
  });
}

function clock() {
  const callbacks = new Map();
  let id = 0;
  return {
    setInterval(fn) {
      id += 1;
      callbacks.set(id, fn);
      return id;
    },
    clearInterval(key) {
      callbacks.delete(key);
    },
    get activeCount() {
      return callbacks.size;
    },
  };
}

function context() {
  const sources = [];
  return {
    currentTime: 0,
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

test("dispose during slow sample load prevents stale audio and scheduler", async () => {
  const gate = deferred();
  const audio = context();
  const timers = clock();
  const bank = {
    isConfigured: () => true,
    load: () => gate.promise,
    resolveMidi(midi) {
      return { buffer: { midi }, playbackRate: 1, referenceMidi: midi };
    },
  };
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => audio,
    sampleBank: bank,
    clock: timers,
  });

  const pending = engine.play({
    plan: plan("pkg-a", 60),
    tempoBpm: 120,
  });
  engine.dispose();
  gate.resolve();
  await pending;

  assert.equal(audio.sources.length, 0);
  assert.equal(timers.activeCount, 0);
});

test("new package supersedes a pending old package load", async () => {
  const gate = deferred();
  const audio = context();
  const timers = clock();
  const bank = {
    isConfigured: () => true,
    load: () => gate.promise,
    resolveMidi(midi) {
      return { buffer: { midi }, playbackRate: 1, referenceMidi: midi };
    },
  };
  const engine = createWebAudioPianoEngine({
    audioContextFactory: () => audio,
    sampleBank: bank,
    clock: timers,
  });

  const oldPlay = engine.play({
    plan: plan("pkg-a", 60),
    tempoBpm: 120,
  });
  const newPlay = engine.play({
    plan: plan("pkg-b", 67),
    tempoBpm: 120,
  });

  gate.resolve();
  await Promise.all([oldPlay, newPlay]);

  assert.equal(audio.sources.length, 1);
  assert.equal(audio.sources[0].buffer.midi, 67);
  assert.equal(timers.activeCount, 1);
});
