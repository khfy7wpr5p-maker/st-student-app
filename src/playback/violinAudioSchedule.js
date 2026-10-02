import { createScoreFollowIndex } from "../practice/scoreFollowIndex.js";

const EPSILON = 1e-9;
const ONSET_PROBE_BEATS = 4 * EPSILON;

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
      note.measureIndex >= 0 &&
      validIdentity(note.voice, 64),
  );
}

function exactTargetSourceEvent(index, note, targetPartId) {
  let resolved;
  try {
    resolved = index.resolveBeat(note.startBeat);
  } catch {
    return null;
  }

  if (
    resolved === null ||
    !Array.isArray(resolved.activeEvents) ||
    !Array.isArray(resolved.highlightRefs)
  ) {
    return null;
  }

  const targetEvents = resolved.activeEvents.filter(
    (event) => event?.partId === targetPartId,
  );
  const targetRefs = resolved.highlightRefs.filter(
    (ref) => ref?.partId === targetPartId,
  );
  if (targetEvents.length !== 1 || targetRefs.length !== 1) {
    return null;
  }

  const event = targetEvents[0];
  const ref = targetRefs[0];
  const sourceVoice = Number.isSafeInteger(ref?.voice)
    ? String(ref.voice)
    : null;
  if (
    !validIdentity(event?.eventId, 512) ||
    event.measureIndex !== note.measureIndex ||
    event.midi !== note.midi ||
    sourceVoice === null ||
    note.voice !== sourceVoice ||
    (event.transpositionSemitones !== undefined &&
      event.transpositionSemitones !== 0)
  ) {
    return null;
  }

  if (note.startBeat >= ONSET_PROBE_BEATS) {
    let immediatelyBefore;
    try {
      immediatelyBefore = index.resolveBeat(
        note.startBeat - ONSET_PROBE_BEATS,
      );
    } catch {
      return null;
    }

    if (
      immediatelyBefore === null ||
      !Array.isArray(immediatelyBefore.activeEvents)
    ) {
      return null;
    }

    const sameSourceEventWasAlreadyActive =
      immediatelyBefore.activeEvents.some(
        (candidate) =>
          candidate?.partId === targetPartId &&
          candidate?.eventId === event.eventId,
      );
    if (sameSourceEventWasAlreadyActive) {
      return null;
    }
  }

  return Object.freeze({ event, voice: sourceVoice });
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
    const exactSource = exactTargetSourceEvent(
      index,
      note,
      targetPartId,
    );
    if (exactSource === null) {
      return null;
    }

    midiSet.add(note.midi);
    events.push(
      Object.freeze({
        sourceEventId: exactSource.event.eventId,
        partId: targetPartId,
        measureIndex: note.measureIndex,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
        midi: note.midi,
        voice: exactSource.voice,
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
