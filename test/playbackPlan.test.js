import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PLAYBACK_MEASURES,
  MAX_PLAYBACK_NOTES,
  PLAYBACK_QUALITIES,
  assertPlaybackPlan,
  validatePlaybackPlan,
} from "../src/playback/playbackPlan.js";

function makePlan(overrides = {}) {
  return {
    schemaVersion: 1,
    quality: PLAYBACK_QUALITIES.APPROXIMATE,
    packageId: "pkg-a",
    referenceTempoBpm: 120,
    tempoMap: [{ beat: 0, bpm: 120 }],
    measures: [{ index: 0, startBeat: 0, endBeat: 4 }],
    notes: [{
      startBeat: 0,
      durationBeats: 1,
      midi: 60,
      measureIndex: 0,
      partId: "P1",
      voice: "1",
    }],
    ...overrides,
  };
}

test("valid playback plan is deeply frozen", () => {
  const result = assertPlaybackPlan(makePlan(), { packageId: "pkg-a" });

  assert.equal(result.quality, PLAYBACK_QUALITIES.APPROXIMATE);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.tempoMap), true);
  assert.equal(Object.isFrozen(result.tempoMap[0]), true);
  assert.equal(Object.isFrozen(result.measures), true);
  assert.equal(Object.isFrozen(result.notes), true);
});

test("valid FULL plan can be constrained by allowed quality", () => {
  const result = validatePlaybackPlan(
    makePlan({ quality: PLAYBACK_QUALITIES.FULL }),
    { packageId: "pkg-a", allowedQuality: PLAYBACK_QUALITIES.FULL },
  );

  assert.equal(result.ok, true);
  assert.equal(result.plan.quality, PLAYBACK_QUALITIES.FULL);
});

test("playback plan rejects package identity mismatch", () => {
  const result = validatePlaybackPlan(makePlan(), { packageId: "pkg-b" });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /packageId/);
});

test("playback plan rejects unsupported quality", () => {
  const result = validatePlaybackPlan(
    makePlan({ quality: "CERTAIN" }),
    { packageId: "pkg-a" },
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /quality/);
});

test("allowed quality constraint rejects another valid quality", () => {
  const result = validatePlaybackPlan(makePlan(), {
    packageId: "pkg-a",
    allowedQuality: PLAYBACK_QUALITIES.FULL,
  });

  assert.equal(result.ok, false);
});

test("playback plan rejects non-finite and invalid numeric fields", () => {
  for (const plan of [
    makePlan({ referenceTempoBpm: Number.NaN }),
    makePlan({ tempoMap: [{ beat: 0, bpm: Number.POSITIVE_INFINITY }] }),
    makePlan({ tempoMap: [{ beat: -1, bpm: 120 }] }),
    makePlan({ measures: [{ index: 0, startBeat: 2, endBeat: 2 }] }),
    makePlan({ notes: [{ ...makePlan().notes[0], durationBeats: 0 }] }),
    makePlan({ notes: [{ ...makePlan().notes[0], startBeat: -1 }] }),
  ]) {
    assert.equal(
      validatePlaybackPlan(plan, { packageId: "pkg-a" }).ok,
      false,
    );
  }
});

test("playback plan rejects invalid MIDI values", () => {
  for (const midi of [-1, 60.5, 128]) {
    const result = validatePlaybackPlan(
      makePlan({ notes: [{ ...makePlan().notes[0], midi }] }),
      { packageId: "pkg-a" },
    );
    assert.equal(result.ok, false);
  }
});

test("playback plan requires non-decreasing tempo map", () => {
  const result = validatePlaybackPlan(
    makePlan({
      tempoMap: [
        { beat: 2, bpm: 100 },
        { beat: 1, bpm: 120 },
      ],
    }),
    { packageId: "pkg-a" },
  );

  assert.equal(result.ok, false);
});

test("playback plan requires ordered non-overlapping measures", () => {
  const result = validatePlaybackPlan(
    makePlan({
      measures: [
        { index: 0, startBeat: 0, endBeat: 4 },
        { index: 1, startBeat: 3, endBeat: 8 },
      ],
    }),
    { packageId: "pkg-a" },
  );

  assert.equal(result.ok, false);
});

test("playback plan enforces note and measure limits", () => {
  const tooManyNotes = Array.from(
    { length: MAX_PLAYBACK_NOTES + 1 },
    (_, index) => ({
      ...makePlan().notes[0],
      startBeat: index,
    }),
  );
  const tooManyMeasures = Array.from(
    { length: MAX_PLAYBACK_MEASURES + 1 },
    (_, index) => ({
      index,
      startBeat: index,
      endBeat: index + 1,
    }),
  );

  assert.equal(
    validatePlaybackPlan(
      makePlan({ notes: tooManyNotes }),
      { packageId: "pkg-a" },
    ).ok,
    false,
  );
  assert.equal(
    validatePlaybackPlan(
      makePlan({ measures: tooManyMeasures }),
      { packageId: "pkg-a" },
    ).ok,
    false,
  );
});

test("playback plan requires at least one playable note", () => {
  const result = validatePlaybackPlan(
    makePlan({ notes: [] }),
    { packageId: "pkg-a" },
  );

  assert.equal(result.ok, false);
});

test("assertPlaybackPlan throws only bounded public detail", () => {
  assert.throws(
    () => assertPlaybackPlan(makePlan({ packageId: "secret-package" }), {
      packageId: "pkg-a",
    }),
    /^TypeError: invalid playback plan$/,
  );
});
