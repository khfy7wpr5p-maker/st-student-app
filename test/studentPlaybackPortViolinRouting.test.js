import test from "node:test";
import assert from "node:assert/strict";

import { createStudentPlaybackPort } from "../src/playback/studentPlaybackPort.js";

function plan(packageId = "pkg-v") {
  return Object.freeze({
    schemaVersion: 1,
    quality: "FULL",
    packageId,
    referenceTempoBpm: 120,
    tempoMap: Object.freeze([Object.freeze({ beat: 0, bpm: 120 })]),
    measures: Object.freeze([
      Object.freeze({ index: 0, startBeat: 0, endBeat: 4 }),
    ]),
    notes: Object.freeze([
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

function pkg({ packageId = "pkg-v", violin = true } = {}) {
  const content = {
    score: Object.freeze({
      format: "musicxml",
      data: "<score-partwise><part id=\"P1\"/></score-partwise>",
    }),
    canonicalEvents: Object.freeze([]),
  };
  if (violin) {
    content.violin = Object.freeze({
      schemaVersion: 1,
      targetPartId: "P1",
      position: 1,
      stringLengthMm: 328,
    });
  }
  return Object.freeze({
    packageId,
    practice: Object.freeze({
      allowTempoChange: false,
      allowMeasureRepeat: false,
    }),
    content: Object.freeze(content),
  });
}

function makeEngine() {
  const calls = [];
  return {
    calls,
    isSupported() {
      return true;
    },
    async play(args) {
      calls.push(["play", args]);
    },
    async playRange(args) {
      calls.push(["playRange", args]);
    },
    subscribePosition() {
      return () => {};
    },
    pause() {},
    async restart() {},
    setTempo() {},
    setMeasureRepeatEnabled() {},
    dispose() {
      calls.push(["dispose"]);
    },
  };
}

function makeResolver(work, resolvedPlan) {
  const context = Object.freeze({
    plan: resolvedPlan,
    timingProvenance: Object.freeze({
      kind: "EXACT_SCORE_SOURCE",
      musicXml: work.content.score.data,
    }),
  });
  return {
    context,
    resolvePackageContext() {
      return context;
    },
  };
}

test("explicit violin V1 prepares before full playback and forwards the same routing generation", async () => {
  const work = pkg();
  const resolvedPlan = plan(work.packageId);
  const resolver = makeResolver(work, resolvedPlan);
  const engine = makeEngine();
  const order = [];
  const prepared = [];
  const schedule = Object.freeze({ packageId: work.packageId });
  const lane = {
    async prepareForPackage(request) {
      order.push("prepare");
      prepared.push(request);
      return true;
    },
    stopAll() {},
  };
  const port = createStudentPlaybackPort({
    playbackPlanResolver: resolver,
    engine,
    violinAudioLane: lane,
    violinAudioScheduleFactory(args) {
      assert.equal(args.pkg, work);
      assert.equal(args.sourceId, work.packageId);
      assert.equal(args.musicXml, work.content.score.data);
      assert.equal(args.targetPartId, "P1");
      assert.equal(args.playbackContext, resolver.context);
      return schedule;
    },
  });
  engine.play = async (args) => {
    order.push("play");
    engine.calls.push(["play", args]);
  };

  await port.playPackage(work);

  assert.deepEqual(order, ["prepare", "play"]);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].schedule, schedule);
  assert.equal(Number.isSafeInteger(prepared[0].generation), true);
  const playCall = engine.calls.find(([name]) => name === "play");
  assert.equal(playCall[1].routingGeneration, prepared[0].generation);
});

test("violin preparation false still keeps full playback on the router piano fallback", async () => {
  const work = pkg();
  const resolvedPlan = plan(work.packageId);
  const resolver = makeResolver(work, resolvedPlan);
  const engine = makeEngine();
  const prepared = [];
  const lane = {
    async prepareForPackage(request) {
      prepared.push(request);
      return false;
    },
    stopAll() {},
  };
  const port = createStudentPlaybackPort({
    playbackPlanResolver: resolver,
    engine,
    violinAudioLane: lane,
    violinAudioScheduleFactory: () => null,
  });

  await port.playPackage(work);

  assert.equal(prepared.length, 1);
  const playCall = engine.calls.find(([name]) => name === "play");
  assert.equal(playCall !== undefined, true);
  assert.equal(playCall[1].routingGeneration, prepared[0].generation);
});

test("packages without explicit violin V1 never prepare the violin lane", async () => {
  const work = pkg({ violin: false });
  const resolvedPlan = plan(work.packageId);
  const resolver = makeResolver(work, resolvedPlan);
  const engine = makeEngine();
  let schedules = 0;
  let preparations = 0;
  const port = createStudentPlaybackPort({
    playbackPlanResolver: resolver,
    engine,
    violinAudioLane: {
      async prepareForPackage() {
        preparations += 1;
        return true;
      },
      stopAll() {},
    },
    violinAudioScheduleFactory() {
      schedules += 1;
      return null;
    },
  });

  await port.playPackage(work);

  assert.equal(schedules, 0);
  assert.equal(preparations, 0);
  const playCall = engine.calls.find(([name]) => name === "play");
  assert.equal(Object.hasOwn(playCall[1], "routingGeneration"), false);
});

test("one-measure range playback prepares violin before the shared scheduler range starts", async () => {
  const work = pkg();
  const resolvedPlan = plan(work.packageId);
  const resolver = makeResolver(work, resolvedPlan);
  const engine = makeEngine();
  const order = [];
  let preparedGeneration = null;
  const port = createStudentPlaybackPort({
    playbackPlanResolver: resolver,
    engine,
    violinAudioLane: {
      async prepareForPackage({ generation }) {
        order.push("prepare");
        preparedGeneration = generation;
        return true;
      },
      stopAll() {},
    },
    violinAudioScheduleFactory: () => Object.freeze({ packageId: work.packageId }),
  });
  engine.playRange = async (args) => {
    order.push("playRange");
    engine.calls.push(["playRange", args]);
  };

  await port.playMeasureOnceForPackage(work, {
    startBeat: 0,
    endBeat: 4,
  });

  assert.deepEqual(order, ["prepare", "playRange"]);
  const rangeCall = engine.calls.find(([name]) => name === "playRange");
  assert.equal(rangeCall[1].routingGeneration, preparedGeneration);
});

test("unexpected violin preparation exception never blocks normal piano playback", async () => {
  const work = pkg();
  const resolvedPlan = plan(work.packageId);
  const resolver = makeResolver(work, resolvedPlan);
  const engine = makeEngine();
  let stopped = 0;
  const port = createStudentPlaybackPort({
    playbackPlanResolver: resolver,
    engine,
    violinAudioLane: {
      async prepareForPackage() {
        throw new Error("private violin failure");
      },
      stopAll() {
        stopped += 1;
      },
    },
    violinAudioScheduleFactory: () => Object.freeze({ packageId: work.packageId }),
  });

  await port.playPackage(work);

  const playCall = engine.calls.find(([name]) => name === "play");
  assert.equal(playCall !== undefined, true);
  assert.equal(Object.hasOwn(playCall[1], "routingGeneration"), false);
  assert.ok(stopped >= 1);
});
