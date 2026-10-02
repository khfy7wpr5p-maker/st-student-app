import test from "node:test";
import assert from "node:assert/strict";

import { createViolinAudioLane } from "../src/playback/violinAudioLane.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeSchedule({
  packageId = "pkg-a",
  sourceId = packageId,
  targetPartId = "P1",
  pitches = [{ midi: 62 }, { midi: 66 }],
  events = [
    {
      sourceEventId: "P1:0:1:0",
      partId: targetPartId,
      measureIndex: 0,
      startBeat: 0,
      durationBeats: 2,
      midi: 66,
      voice: "1",
    },
    {
      sourceEventId: "P1:0:1:1",
      partId: targetPartId,
      measureIndex: 0,
      startBeat: 2,
      durationBeats: 2,
      midi: 62,
      voice: "1",
    },
  ],
} = {}) {
  return Object.freeze({
    packageId,
    sourceId,
    targetPartId,
    pitches: Object.freeze(pitches.map((pitch) => Object.freeze({ ...pitch }))),
    events: Object.freeze(events.map((event) => Object.freeze({ ...event }))),
  });
}

function targetNote({
  partId = "P1",
  measureIndex = 0,
  startBeat = 0,
  durationBeats = 2,
  midi = 66,
  voice = "1",
} = {}) {
  return Object.freeze({
    partId,
    measureIndex,
    startBeat,
    durationBeats,
    midi,
    voice,
  });
}

function createHarness({
  loadResult = "runtime",
  prepareResult = { ok: true },
  unlockResult = { ok: true },
  scheduleResult = { ok: true, requestId: "scheduled" },
} = {}) {
  const calls = {
    load: 0,
    createAudioEngine: [],
    setInstrument: [],
    unlock: 0,
    preparePitches: [],
    scheduleNote: [],
    stopAll: 0,
  };

  let nextPrepareResult = prepareResult;
  let nextScheduleResult = scheduleResult;

  const engine = {
    async setInstrument(instrumentId) {
      calls.setInstrument.push(instrumentId);
    },
    async unlockFromUserGesture() {
      calls.unlock += 1;
      return typeof unlockResult === "function" ? unlockResult() : unlockResult;
    },
    async preparePitches(request) {
      calls.preparePitches.push(request);
      const result = nextPrepareResult;
      return typeof result === "function" ? result(request) : await result;
    },
    async scheduleNote(request) {
      calls.scheduleNote.push(request);
      const result = nextScheduleResult;
      return typeof result === "function" ? result(request) : await result;
    },
    stopAll() {
      calls.stopAll += 1;
    },
  };

  const runtime = {
    version: "0.2.0",
    createAudioEngine(options) {
      calls.createAudioEngine.push(options);
      return engine;
    },
  };

  const runtimeLoader = {
    async load() {
      calls.load += 1;
      if (loadResult instanceof Error) throw loadResult;
      if (loadResult === null) return null;
      return loadResult === "runtime" ? runtime : loadResult;
    },
  };

  const sharedContext = Object.freeze({ state: "running", currentTime: 10 });
  const audioContextFactory = () => sharedContext;

  return {
    calls,
    engine,
    runtime,
    runtimeLoader,
    audioContextFactory,
    sharedContext,
    setPrepareResult(value) {
      nextPrepareResult = value;
    },
    setScheduleResult(value) {
      nextScheduleResult = value;
    },
  };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

test("preparation selects VIOLIN on the shared context and forwards the exact unique pitch set", async () => {
  const harness = createHarness();
  const lane = createViolinAudioLane({
    runtimeLoader: harness.runtimeLoader,
    audioContextFactory: harness.audioContextFactory,
  });
  const schedule = makeSchedule({
    pitches: [{ midi: 55 }, { midi: 67 }, { midi: 79 }],
  });

  assert.equal(await lane.prepareForPackage({ schedule, generation: 7 }), true);
  assert.equal(harness.calls.load, 1);
  assert.equal(harness.calls.createAudioEngine.length, 1);
  assert.equal(
    harness.calls.createAudioEngine[0].audioContextFactory,
    harness.audioContextFactory,
  );
  assert.equal(harness.calls.createAudioEngine[0].defaultInstrument, "VIOLIN");
  assert.deepEqual(harness.calls.setInstrument, ["VIOLIN"]);
  assert.equal(harness.calls.unlock, 1);
  assert.deepEqual(harness.calls.preparePitches, [
    {
      instrumentId: "VIOLIN",
      pitches: [{ midi: 55 }, { midi: 67 }, { midi: 79 }],
    },
  ]);
});

test("incomplete or failed violin preparation keeps the target on normal piano instead of disabling playback", async () => {
  const pending = deferred();
  const harness = createHarness({ prepareResult: pending.promise });
  const lane = createViolinAudioLane({
    runtimeLoader: harness.runtimeLoader,
    audioContextFactory: harness.audioContextFactory,
  });
  const schedule = makeSchedule();

  const preparation = lane.prepareForPackage({ schedule, generation: 3 });
  await flushAsync();

  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 12,
      durationSeconds: 1,
      generation: 3,
    }),
    "PIANO",
  );

  pending.resolve({ ok: false, error: { code: "SAMPLE_UNAVAILABLE" } });
  assert.equal(await preparation, false);
  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 12,
      durationSeconds: 1,
      generation: 3,
    }),
    "PIANO",
  );
});

test("prepared target routes externally with exact absolute time, duration, pitch and source identity", async () => {
  const harness = createHarness();
  const lane = createViolinAudioLane({
    runtimeLoader: harness.runtimeLoader,
    audioContextFactory: harness.audioContextFactory,
  });
  const schedule = makeSchedule();
  await lane.prepareForPackage({ schedule, generation: 11 });

  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 15.25,
      durationSeconds: 1.75,
      generation: 11,
    }),
    "EXTERNAL",
  );
  await flushAsync();

  assert.equal(harness.calls.scheduleNote.length, 1);
  assert.deepEqual(
    {
      sourceRevisionId: harness.calls.scheduleNote[0].sourceRevisionId,
      sourceEventId: harness.calls.scheduleNote[0].sourceEventId,
      instrumentId: harness.calls.scheduleNote[0].instrumentId,
      pitch: harness.calls.scheduleNote[0].pitch,
      startTimeSeconds: harness.calls.scheduleNote[0].startTimeSeconds,
      durationMs: harness.calls.scheduleNote[0].durationMs,
    },
    {
      sourceRevisionId: "pkg-a",
      sourceEventId: "P1:0:1:0",
      instrumentId: "VIOLIN",
      pitch: { midi: 66 },
      startTimeSeconds: 15.25,
      durationMs: 1750,
    },
  );
  assert.equal(typeof harness.calls.scheduleNote[0].requestId, "string");
  assert.ok(harness.calls.scheduleNote[0].requestId.length > 0);
});

test("non-target notes always stay on piano and are never sent to the violin engine", async () => {
  const harness = createHarness();
  const lane = createViolinAudioLane({
    runtimeLoader: harness.runtimeLoader,
    audioContextFactory: harness.audioContextFactory,
  });
  await lane.prepareForPackage({ schedule: makeSchedule(), generation: 5 });

  assert.equal(
    lane.routeNote({
      note: targetNote({ partId: "P2" }),
      startTimeSeconds: 13,
      durationSeconds: 1,
      generation: 5,
    }),
    "PIANO",
  );
  assert.equal(harness.calls.scheduleNote.length, 0);
});

test("post-start engine failure stops the external lane and suppresses later target notes for that generation", async () => {
  const harness = createHarness({
    scheduleResult: {
      ok: false,
      error: { code: "ENGINE_FAILURE", message: "bounded" },
    },
  });
  const lane = createViolinAudioLane({
    runtimeLoader: harness.runtimeLoader,
    audioContextFactory: harness.audioContextFactory,
  });
  const schedule = makeSchedule();
  await lane.prepareForPackage({ schedule, generation: 9 });

  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 20,
      durationSeconds: 1,
      generation: 9,
    }),
    "EXTERNAL",
  );
  await flushAsync();

  assert.equal(harness.calls.stopAll, 1);
  assert.equal(
    lane.routeNote({
      note: targetNote({ startBeat: 2, midi: 62 }),
      startTimeSeconds: 21,
      durationSeconds: 1,
      generation: 9,
    }),
    "SUPPRESS",
  );
  assert.equal(harness.calls.scheduleNote.length, 1);
});

test("stale package preparation cannot become current and stale generations cannot sound", async () => {
  const firstPrepare = deferred();
  const harness = createHarness({ prepareResult: firstPrepare.promise });
  const lane = createViolinAudioLane({
    runtimeLoader: harness.runtimeLoader,
    audioContextFactory: harness.audioContextFactory,
  });

  const first = lane.prepareForPackage({
    schedule: makeSchedule({ packageId: "pkg-old" }),
    generation: 1,
  });
  await flushAsync();

  harness.setPrepareResult({ ok: true });
  const second = lane.prepareForPackage({
    schedule: makeSchedule({ packageId: "pkg-new" }),
    generation: 2,
  });
  firstPrepare.resolve({ ok: true });

  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 14,
      durationSeconds: 1,
      generation: 1,
    }),
    "SUPPRESS",
  );
  assert.equal(harness.calls.scheduleNote.length, 0);
});

test("disposed lane cannot schedule either audio lane through a stale callback", async () => {
  const harness = createHarness();
  const lane = createViolinAudioLane({
    runtimeLoader: harness.runtimeLoader,
    audioContextFactory: harness.audioContextFactory,
  });
  await lane.prepareForPackage({ schedule: makeSchedule(), generation: 4 });

  lane.dispose();

  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 14,
      durationSeconds: 1,
      generation: 4,
    }),
    "SUPPRESS",
  );
  assert.equal(harness.calls.scheduleNote.length, 0);
  assert.equal(harness.calls.stopAll, 1);
});

test("unsupported runtime or loader failure degrades to piano without exposing engine errors", async () => {
  for (const loadResult of [null, new Error("private provider detail")]) {
    const harness = createHarness({ loadResult });
    const lane = createViolinAudioLane({
      runtimeLoader: harness.runtimeLoader,
      audioContextFactory: harness.audioContextFactory,
    });
    const schedule = makeSchedule();

    assert.equal(
      await lane.prepareForPackage({ schedule, generation: 6 }),
      false,
    );
    assert.equal(
      lane.routeNote({
        note: targetNote(),
        startTimeSeconds: 14,
        durationSeconds: 1,
        generation: 6,
      }),
      "PIANO",
    );
  }
});
