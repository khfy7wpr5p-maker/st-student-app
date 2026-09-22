export const PLAYBACK_QUALITIES = Object.freeze({
  FULL: "FULL",
  APPROXIMATE: "APPROXIMATE",
});

export const MAX_PLAYBACK_NOTES = 100_000;
export const MAX_PLAYBACK_MEASURES = 10_000;

const QUALITY_VALUES = new Set(Object.values(PLAYBACK_QUALITIES));

function finite(value) {
  return Number.isFinite(value);
}

function positiveFinite(value) {
  return finite(value) && value > 0;
}

function freezeList(items) {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

function fail(errors, message) {
  errors.push(message);
}

export function validatePlaybackPlan(
  plan,
  { packageId, allowedQuality = null } = {},
) {
  const errors = [];

  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    return Object.freeze({ ok: false, plan: null, errors: Object.freeze(["plan must be an object"]) });
  }

  if (plan.schemaVersion !== 1) {
    fail(errors, "schemaVersion must be 1");
  }

  if (typeof packageId !== "string" || packageId.length === 0) {
    fail(errors, "expected packageId required");
  }

  if (
    typeof plan.packageId !== "string" ||
    plan.packageId.length === 0 ||
    plan.packageId !== packageId
  ) {
    fail(errors, "packageId mismatch");
  }

  if (!QUALITY_VALUES.has(plan.quality)) {
    fail(errors, "unsupported quality");
  } else if (
    allowedQuality !== null &&
    (!QUALITY_VALUES.has(allowedQuality) || plan.quality !== allowedQuality)
  ) {
    fail(errors, "quality not allowed");
  }

  if (!positiveFinite(plan.referenceTempoBpm) || plan.referenceTempoBpm > 1000) {
    fail(errors, "referenceTempoBpm invalid");
  }

  if (!Array.isArray(plan.tempoMap) || plan.tempoMap.length === 0) {
    fail(errors, "tempoMap required");
  }

  const tempoMap = [];
  let previousTempoBeat = -Infinity;

  if (Array.isArray(plan.tempoMap)) {
    for (const entry of plan.tempoMap) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        !finite(entry.beat) ||
        entry.beat < 0 ||
        !positiveFinite(entry.bpm) ||
        entry.bpm > 1000
      ) {
        fail(errors, "tempoMap entry invalid");
        continue;
      }

      if (entry.beat < previousTempoBeat) {
        fail(errors, "tempoMap must be non-decreasing");
      }
      previousTempoBeat = entry.beat;
      tempoMap.push({ beat: entry.beat, bpm: entry.bpm });
    }
  }

  if (!Array.isArray(plan.measures)) {
    fail(errors, "measures required");
  } else if (plan.measures.length > MAX_PLAYBACK_MEASURES) {
    fail(errors, "measure limit exceeded");
  }

  const measures = [];
  let previousMeasureEnd = -Infinity;

  if (Array.isArray(plan.measures)) {
    for (const measure of plan.measures) {
      if (
        measure === null ||
        typeof measure !== "object" ||
        !Number.isInteger(measure.index) ||
        measure.index < 0 ||
        !finite(measure.startBeat) ||
        !finite(measure.endBeat) ||
        measure.startBeat < 0 ||
        measure.endBeat <= measure.startBeat
      ) {
        fail(errors, "measure invalid");
        continue;
      }

      if (measure.startBeat < previousMeasureEnd) {
        fail(errors, "measures must be ordered and non-overlapping");
      }
      previousMeasureEnd = measure.endBeat;
      measures.push({
        index: measure.index,
        startBeat: measure.startBeat,
        endBeat: measure.endBeat,
      });
    }
  }

  if (!Array.isArray(plan.notes) || plan.notes.length === 0) {
    fail(errors, "at least one playable note required");
  } else if (plan.notes.length > MAX_PLAYBACK_NOTES) {
    fail(errors, "note limit exceeded");
  }

  const notes = [];
  let previousNoteStart = -Infinity;

  if (Array.isArray(plan.notes)) {
    for (const note of plan.notes) {
      if (
        note === null ||
        typeof note !== "object" ||
        !finite(note.startBeat) ||
        note.startBeat < 0 ||
        !positiveFinite(note.durationBeats) ||
        !Number.isInteger(note.midi) ||
        note.midi < 0 ||
        note.midi > 127 ||
        !Number.isInteger(note.measureIndex) ||
        note.measureIndex < 0 ||
        typeof note.partId !== "string" ||
        note.partId.length === 0 ||
        !(note.voice === null || typeof note.voice === "string")
      ) {
        fail(errors, "note invalid");
        continue;
      }

      if (note.startBeat < previousNoteStart) {
        fail(errors, "notes must be ordered");
      }
      previousNoteStart = note.startBeat;
      notes.push({
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
        midi: note.midi,
        measureIndex: note.measureIndex,
        partId: note.partId,
        voice: note.voice,
      });
    }
  }

  if (errors.length > 0) {
    return Object.freeze({
      ok: false,
      plan: null,
      errors: Object.freeze(errors),
    });
  }

  const normalized = Object.freeze({
    schemaVersion: 1,
    quality: plan.quality,
    packageId: plan.packageId,
    referenceTempoBpm: plan.referenceTempoBpm,
    tempoMap: freezeList(tempoMap),
    measures: freezeList(measures),
    notes: freezeList(notes),
  });

  return Object.freeze({
    ok: true,
    plan: normalized,
    errors: Object.freeze([]),
  });
}

export function assertPlaybackPlan(plan, options) {
  const result = validatePlaybackPlan(plan, options);

  if (!result.ok) {
    throw new TypeError("invalid playback plan");
  }

  return result.plan;
}
