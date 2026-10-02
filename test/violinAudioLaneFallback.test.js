import test from "node:test";
import assert from "node:assert/strict";

import { createViolinAudioLane } from "../src/playback/violinAudioLane.js";

function validSchedule(packageId = "pkg-old") {
  return Object.freeze({
    packageId,
    sourceId: packageId,
    targetPartId: "P1",
    pitches: Object.freeze([Object.freeze({ midi: 66 })]),
    events: Object.freeze([
      Object.freeze({
        sourceEventId: `${packageId}:event`,
        partId: "P1",
        measureIndex: 0,
        startBeat: 0,
        durationBeats: 2,
        midi: 66,
        voice: "1",
      }),
    ]),
  });
}

function targetNote() {
  return Object.freeze({
    partId: "P1",
    measureIndex: 0,
    startBeat: 0,
    durationBeats: 2,
    midi: 66,
    voice: "1",
  });
}

test("invalid replacement schedule retires old generation and keeps the new generation on piano", async () => {
  let stopCount = 0;
  const engine = {
    async setInstrument() {},
    async unlockFromUserGesture() {
      return { ok: true };
    },
    async preparePitches() {
      return { ok: true };
    },
    async scheduleNote(request) {
      return { ok: true, requestId: request.requestId };
    },
    stopAll() {
      stopCount += 1;
    },
  };
  const lane = createViolinAudioLane({
    runtimeLoader: {
      async load() {
        return {
          createAudioEngine() {
            return engine;
          },
        };
      },
    },
    audioContextFactory() {
      return Object.freeze({ state: "running", currentTime: 1 });
    },
  });

  assert.equal(
    await lane.prepareForPackage({ schedule: validSchedule(), generation: 1 }),
    true,
  );

  assert.equal(
    await lane.prepareForPackage({ schedule: null, generation: 2 }),
    false,
  );
  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 2,
      durationSeconds: 1,
      generation: 2,
    }),
    "PIANO",
  );
  assert.ok(stopCount >= 1, "invalid replacement must silence the old generation");
});

test("an unsupported long target note falls back to piano before external routing starts", async () => {
  let scheduled = 0;
  const engine = {
    async setInstrument() {},
    async unlockFromUserGesture() {
      return { ok: true };
    },
    async preparePitches() {
      return { ok: true };
    },
    async scheduleNote() {
      scheduled += 1;
      return { ok: true, requestId: "scheduled" };
    },
    stopAll() {},
  };
  const lane = createViolinAudioLane({
    runtimeLoader: {
      async load() {
        return {
          createAudioEngine() {
            return engine;
          },
        };
      },
    },
    audioContextFactory() {
      return Object.freeze({ state: "running", currentTime: 1 });
    },
  });

  assert.equal(
    await lane.prepareForPackage({ schedule: validSchedule("pkg-long"), generation: 3 }),
    true,
  );
  assert.equal(
    lane.routeNote({
      note: targetNote(),
      startTimeSeconds: 2,
      durationSeconds: 10.5,
      generation: 3,
    }),
    "PIANO",
  );
  assert.equal(scheduled, 0);
});
