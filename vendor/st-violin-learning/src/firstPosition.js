const STEP_TO_PITCH_CLASS = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

export const DEFAULT_STRING_LENGTH_MM = 328;

export const VIOLIN_STRINGS = Object.freeze([
  Object.freeze({ id: "G", openMidi: 55, openPitch: "G3" }),
  Object.freeze({ id: "D", openMidi: 62, openPitch: "D4" }),
  Object.freeze({ id: "A", openMidi: 69, openPitch: "A4" }),
  Object.freeze({ id: "E", openMidi: 76, openPitch: "E5" }),
]);

const FIRST_POSITION_BY_OFFSET = Object.freeze({
  0: Object.freeze({ finger: 0, placement: "OPEN" }),
  1: Object.freeze({ finger: 1, placement: "LOW" }),
  2: Object.freeze({ finger: 1, placement: "NORMAL" }),
  3: Object.freeze({ finger: 2, placement: "LOW" }),
  4: Object.freeze({ finger: 2, placement: "HIGH" }),
  5: Object.freeze({ finger: 3, placement: "NORMAL" }),
  6: Object.freeze({ finger: 3, placement: "HIGH" }),
  7: Object.freeze({ finger: 4, placement: "NORMAL" }),
});

function assertStringLength(stringLengthMm) {
  if (!Number.isFinite(stringLengthMm) || stringLengthMm <= 0) {
    throw new TypeError("stringLengthMm must be a positive finite number");
  }
}

export function midiFromMusicXmlPitch(pitch) {
  if (!pitch || typeof pitch !== "object") {
    throw new TypeError("pitch must be an object");
  }

  const step = String(pitch.step ?? "").toUpperCase();
  const octave = pitch.octave;
  const alter = pitch.alter ?? 0;

  if (!(step in STEP_TO_PITCH_CLASS)) {
    throw new RangeError("pitch.step must be one of A, B, C, D, E, F, G");
  }
  if (!Number.isInteger(octave) || octave < -1 || octave > 9) {
    throw new RangeError("pitch.octave must be an integer between -1 and 9");
  }
  if (!Number.isInteger(alter) || alter < -2 || alter > 2) {
    throw new RangeError("pitch.alter must be an integer between -2 and 2");
  }

  const midi = 12 * (octave + 1) + STEP_TO_PITCH_CLASS[step] + alter;
  if (midi < 0 || midi > 127) {
    throw new RangeError("resolved MIDI pitch is outside 0..127");
  }
  return midi;
}

export function normalizedStopPosition(semitoneOffset) {
  if (!Number.isInteger(semitoneOffset) || semitoneOffset < 0) {
    throw new RangeError("semitoneOffset must be a non-negative integer");
  }
  return 1 - 2 ** (-semitoneOffset / 12);
}

export function stopDistanceFromNutMm(
  semitoneOffset,
  stringLengthMm = DEFAULT_STRING_LENGTH_MM,
) {
  assertStringLength(stringLengthMm);
  return stringLengthMm * normalizedStopPosition(semitoneOffset);
}

function makeCandidate(stringInfo, midi, stringLengthMm) {
  const semitoneOffset = midi - stringInfo.openMidi;
  const fingering = FIRST_POSITION_BY_OFFSET[semitoneOffset];
  if (!fingering) return null;

  return Object.freeze({
    stringId: stringInfo.id,
    openPitch: stringInfo.openPitch,
    openMidi: stringInfo.openMidi,
    finger: fingering.finger,
    placement: fingering.placement,
    semitoneOffset,
    normalizedPosition: normalizedStopPosition(semitoneOffset),
    distanceFromNutMm: stopDistanceFromNutMm(semitoneOffset, stringLengthMm),
  });
}

function orderCandidates(candidates, preferredStringId) {
  return [...candidates].sort((a, b) => {
    if (preferredStringId) {
      if (a.stringId === preferredStringId && b.stringId !== preferredStringId) return -1;
      if (b.stringId === preferredStringId && a.stringId !== preferredStringId) return 1;
    }

    const aOpen = a.finger === 0 ? 0 : 1;
    const bOpen = b.finger === 0 ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    return b.openMidi - a.openMidi;
  });
}

export function resolveFirstPositionMidi(
  midi,
  {
    stringLengthMm = DEFAULT_STRING_LENGTH_MM,
    preferredStringId = null,
  } = {},
) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError("midi must be an integer between 0 and 127");
  }
  assertStringLength(stringLengthMm);

  if (
    preferredStringId !== null &&
    !VIOLIN_STRINGS.some((stringInfo) => stringInfo.id === preferredStringId)
  ) {
    throw new RangeError("preferredStringId must be G, D, A, E, or null");
  }

  const candidates = VIOLIN_STRINGS
    .map((stringInfo) => makeCandidate(stringInfo, midi, stringLengthMm))
    .filter(Boolean);

  if (candidates.length === 0) {
    return Object.freeze({
      supported: false,
      midi,
      position: 1,
      primary: null,
      alternatives: Object.freeze([]),
      reason: "OUTSIDE_FIRST_POSITION",
    });
  }

  const ordered = orderCandidates(candidates, preferredStringId);
  return Object.freeze({
    supported: true,
    midi,
    position: 1,
    primary: ordered[0],
    alternatives: Object.freeze(ordered.slice(1)),
    reason: null,
  });
}

export function resolveFirstPositionNote(
  note,
  options = {},
) {
  if (!note || typeof note !== "object") {
    throw new TypeError("note must be an object");
  }
  if (typeof note.noteId !== "string" || note.noteId.trim() === "") {
    throw new TypeError("note.noteId must be a non-empty string");
  }

  const midi = midiFromMusicXmlPitch(note.pitch);
  const resolved = resolveFirstPositionMidi(midi, options);

  return Object.freeze({
    noteId: note.noteId,
    pitch: Object.freeze({
      step: String(note.pitch.step).toUpperCase(),
      alter: note.pitch.alter ?? 0,
      octave: note.pitch.octave,
      midi,
    }),
    ...resolved,
  });
}
