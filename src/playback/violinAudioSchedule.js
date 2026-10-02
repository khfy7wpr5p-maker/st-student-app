import { createScoreFollowIndex } from "../practice/scoreFollowIndex.js";

const EPSILON = 1e-9;

function validIdentity(value, maxLength = 256) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !value.includes("\u0000")
  );
}

function validTargetNote(note, targetPartId) {
  return Boolean(
    note !== null &&
      typeof note === "object" &&
      note.partId === targetPartId &&
      Number.isFinite(note.startBeat) &&
      note.startBeat >= 0 &&
      Number.isFinite(note.durationBeats) &&
      note.durationBeats > 0 &&
      Number.isInteger(note.midi) &&
      note.midi >= 0 &&
      note.midi <= 127 &&
      Number.isInteger(note.measureIndex) &&
      note.measureIndex >= 0,
  );
}

function exactTargetSourceEvent(index, note, targetPartId) {
  let resolved;
  try {
    resolved = index.resolveBeat(note.startBeat);
  } catch {
    return null;
  }

  if (resolved === null || !Array.isArray(resolved.activeEvents)) {
    return null;
  }

  const targetEvents = resolved.activeEvents.filter(
    (event) => event?.partId === targetPartId,
  );
  if (targetEvents.length !== 1) {
    return null;
  }

  const event = targetEvents[0];
  if (
    !validIdentity(event?.eventId, 512) ||
    event.measureIndex !== note.measureIndex ||
    event.midi !== note.midi ||
    (event.transpositionSemitones !== undefined &&
      event.transpositionSemitones !== 0)
  ) {
    return null;
  }

  return event;
}

export function createViolinAudioSchedule({
  pkg,
  sourceId,
  musicXml,
  targetPartId,
  playbackContext,
  createIndex = createScoreFollowIndex,
} = {}) {
  const packageId = validIdentity(pkg?.packageId) ? pkg.packageId : null;
  const provenance = playbackContext?.timingProvenance;
  const plan = playbackContext?.plan;

  if (
    packageId === null ||
    sourceId !== packageId ||
    !validIdentity(sourceId) ||
    !validIdentity(targetPartId, 128) ||
    typeof musicXml !== "string" ||
    musicXml.length === 0 ||
    plan === null ||
    typeof plan !== "object" ||
    plan.packageId !== packageId ||
    !Array.isArray(plan.notes) ||
    provenance === null ||
    typeof provenance !== "object" ||
    provenance.kind !== "EXACT_SCORE_SOURCE" ||
    provenance.musicXml !== musicXml ||
    typeof createIndex !== "function"
  ) {
    return null;
  }

  const targetNotes = plan.notes.filter(
    (note) => note?.partId === targetPartId,
  );
  if (targetNotes.length === 0) {
    return null;
  }

  let previousEndBeat = -Infinity;
  for (const note of targetNotes) {
    if (!validTargetNote(note, targetPartId)) {
      return null;
    }

    const endBeat = note.startBeat + note.durationBeats;
    if (
      !Number.isFinite(endBeat) ||
      note.startBeat < previousEndBeat - EPSILON
    ) {
      return null;
    }
    previousEndBeat = endBeat;
  }

  let index;
  try {
    index = createIndex({
      packageId,
      sourceId,
      musicXml,
      playbackContext,
    });
  } catch {
    return null;
  }

  if (
    index === null ||
    typeof index !== "object" ||
    index.measureMapping !== "EXACT" ||
    index.eventMapping !== "EXACT" ||
    typeof index.resolveBeat !== "function"
  ) {
    return null;
  }

  const events = [];
  const midiSet = new Set();

  for (const note of targetNotes) {
    const sourceEvent = exactTargetSourceEvent(
      index,
      note,
      targetPartId,
    );
    if (sourceEvent === null) {
      return null;
    }

    midiSet.add(note.midi);
    events.push(
      Object.freeze({
        sourceEventId: sourceEvent.eventId,
        partId: targetPartId,
        measureIndex: note.measureIndex,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
        midi: note.midi,
      }),
    );
  }

  const pitches = Object.freeze(
    [...midiSet]
      .sort((left, right) => left - right)
      .map((midi) => Object.freeze({ midi })),
  );

  return Object.freeze({
    packageId,
    sourceId,
    targetPartId,
    pitches,
    events: Object.freeze(events),
  });
}
