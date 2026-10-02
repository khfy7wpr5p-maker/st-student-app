import test from "node:test";
import assert from "node:assert/strict";

import { createViolinAudioLane } from "../src/playback/violinAudioLane.js";

function schedule(packageId, midi) {
  return Object.freeze({
    packageId,
    sourceId: packageId,
    targetPartId: "P1",
    pitches: Object.freeze([Object.freeze({ midi })]),
    events: Object.freeze([
      Object.freeze({
        sourceEventId: `${packageId}:event`,
        partId: "P1",
        measureIndex: 0,
        startBeat: 0,
        durationBeats: 1,
        midi,
        voice: "1",
      }),
    ]),
  });
}

test("consecutive package preparations reuse one violin engine and one shared AudioContext factory", async () => {
  let createCount = 0;
  let stopCount = 0;
  const prepared = [];
  const sharedContext = Object.freeze({ state: "running", currentTime: 1 });
  const audioContextFactory = () => sharedContext;
  const engine = {
    async setInstrument() {},
    async unlockFromUserGesture() {
      return { ok: true };
    },
    async preparePitches(request) {
      prepared.push(request.pitches.map((pitch) => pitch.midi));
      return { ok: true };
    },
    async scheduleNote(request) {
      return { ok: true, requestId: request.requestId };
    },
    stopAll() {
      stopCount += 1;
    },
  };
  const runtimeLoader = {
    async load() {
      return {
        version: "0.2.0",
        createAudioEngine(options) {
          createCount += 1;
          assert.equal(options.audioContextFactory, audioContextFactory);
          return engine;
        },
      };
    },
  };
  const lane = createViolinAudioLane({ runtimeLoader, audioContextFactory });

  assert.equal(
    await lane.prepareForPackage({ schedule: schedule("pkg-a", 60), generation: 1 }),
    true,
  );
  assert.equal(
    await lane.prepareForPackage({ schedule: schedule("pkg-b", 72), generation: 2 }),
    true,
  );

  assert.equal(createCount, 1);
  assert.deepEqual(prepared, [[60], [72]]);
  assert.ok(stopCount >= 1, "re-preparation should silence the previous generation");
});
