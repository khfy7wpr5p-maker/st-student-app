import {
  midiFromMusicXmlPitch,
  resolveFirstPositionNote,
} from "./firstPosition.js";

const EMPTY_ALTERNATIVES = Object.freeze([]);
const MAX_ID_LENGTH = 256;
const MAX_PART_ID_LENGTH = 128;

export const VIOLIN_FOLLOW_STATES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  NO_ACTIVE_NOTE: "NO_ACTIVE_NOTE",
  OUTSIDE_FIRST_POSITION: "OUTSIDE_FIRST_POSITION",
  AMBIGUOUS_EVENT: "AMBIGUOUS_EVENT",
  STALE_EVIDENCE: "STALE_EVIDENCE",
  UNSUPPORTED_SCORE_MAPPING: "UNSUPPORTED_SCORE_MAPPING",
});

function validIdentity(value, maxLength = MAX_ID_LENGTH) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !value.includes("\u0000")
  );
}

function validGeneration(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertTopLevel(binding, snapshot) {
  if (
    binding === null ||
    typeof binding !== "object" ||
    Array.isArray(binding) ||
    !validIdentity(binding.packageId) ||
    !validIdentity(binding.sourceId) ||
    !validIdentity(binding.targetPartId, MAX_PART_ID_LENGTH) ||
    !validGeneration(binding.generation)
  ) {
    throw new TypeError("binding must contain valid package/source/generation/targetPart identities");
  }

  if (
    binding.stringLengthMm !== undefined &&
    (!Number.isFinite(binding.stringLengthMm) || binding.stringLengthMm <= 0)
  ) {
    throw new TypeError("binding.stringLengthMm must be a positive finite number");
  }

  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    !validIdentity(snapshot.packageId) ||
    !validIdentity(snapshot.sourceId) ||
    !validGeneration(snapshot.generation) ||
    typeof snapshot.playing !== "boolean" ||
    !Array.isArray(snapshot.activeEvents)
  ) {
    throw new TypeError("snapshot must contain valid package/source/generation/playback evidence");
  }
}

function unavailable(state, { playing = false, eventId = null } = {}) {
  return Object.freeze({
    state,
    eventId,
    playing,
    position: 1,
    primary: null,
    alternatives: EMPTY_ALTERNATIVES,
  });
}

function validTargetEvent(event, targetPartId) {
  return (
    event !== null &&
    typeof event === "object" &&
    !Array.isArray(event) &&
    event.partId === targetPartId
  );
}

function validEventShape(event) {
  return (
    validIdentity(event.eventId) &&
    validIdentity(event.partId, MAX_PART_ID_LENGTH) &&
    Number.isSafeInteger(event.measureIndex) &&
    event.measureIndex >= 0 &&
    Number.isInteger(event.midi) &&
    event.midi >= 0 &&
    event.midi <= 127 &&
    event.pitch !== null &&
    typeof event.pitch === "object" &&
    !Array.isArray(event.pitch)
  );
}

export function resolveViolinFollowSnapshot({
  binding,
  snapshot,
  preferredStringId = null,
} = {}) {
  assertTopLevel(binding, snapshot);

  if (
    snapshot.packageId !== binding.packageId ||
    snapshot.sourceId !== binding.sourceId ||
    snapshot.generation !== binding.generation
  ) {
    return unavailable(VIOLIN_FOLLOW_STATES.STALE_EVIDENCE, {
      playing: snapshot.playing,
    });
  }

  const targetEvents = snapshot.activeEvents.filter((event) =>
    validTargetEvent(event, binding.targetPartId),
  );

  if (targetEvents.length === 0) {
    return unavailable(VIOLIN_FOLLOW_STATES.NO_ACTIVE_NOTE, {
      playing: snapshot.playing,
    });
  }

  if (targetEvents.length > 1) {
    return unavailable(VIOLIN_FOLLOW_STATES.AMBIGUOUS_EVENT, {
      playing: snapshot.playing,
    });
  }

  const event = targetEvents[0];
  if (!validEventShape(event)) {
    return unavailable(VIOLIN_FOLLOW_STATES.UNSUPPORTED_SCORE_MAPPING, {
      playing: snapshot.playing,
      eventId: validIdentity(event?.eventId) ? event.eventId : null,
    });
  }

  let pitchMidi;
  try {
    pitchMidi = midiFromMusicXmlPitch(event.pitch);
  } catch {
    return unavailable(VIOLIN_FOLLOW_STATES.UNSUPPORTED_SCORE_MAPPING, {
      playing: snapshot.playing,
      eventId: event.eventId,
    });
  }

  if (pitchMidi !== event.midi) {
    return unavailable(VIOLIN_FOLLOW_STATES.UNSUPPORTED_SCORE_MAPPING, {
      playing: snapshot.playing,
      eventId: event.eventId,
    });
  }

  const options = {
    preferredStringId,
    ...(binding.stringLengthMm === undefined
      ? {}
      : { stringLengthMm: binding.stringLengthMm }),
  };

  let resolved;
  try {
    resolved = resolveFirstPositionNote(
      {
        noteId: event.eventId,
        pitch: event.pitch,
      },
      options,
    );
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return unavailable(VIOLIN_FOLLOW_STATES.UNSUPPORTED_SCORE_MAPPING, {
        playing: snapshot.playing,
        eventId: event.eventId,
      });
    }
    throw error;
  }

  if (resolved.supported !== true) {
    return unavailable(VIOLIN_FOLLOW_STATES.OUTSIDE_FIRST_POSITION, {
      playing: snapshot.playing,
      eventId: event.eventId,
    });
  }

  return Object.freeze({
    state: VIOLIN_FOLLOW_STATES.AVAILABLE,
    eventId: event.eventId,
    playing: snapshot.playing,
    position: 1,
    primary: resolved.primary,
    alternatives: resolved.alternatives,
  });
}
