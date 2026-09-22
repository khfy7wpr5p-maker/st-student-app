import {
  PLAYBACK_QUALITIES,
  assertPlaybackPlan,
} from "./playbackPlan.js";
import {
  childrenNamed,
  createBrowserMusicXmlParser,
  firstChildNamed,
  hasDescendantNamed,
  localNameOf,
  numberText,
  textOf,
} from "./musicXmlPlaybackDom.js";

export const MAX_PLAYBACK_MUSICXML_BYTES = 4 * 1024 * 1024;

const STEP_TO_SEMITONE = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

function sourceBytes(value) {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function parseDuration(note, divisions) {
  const duration = numberText(firstChildNamed(note, "duration"));

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(divisions) ||
    divisions <= 0
  ) {
    return null;
  }

  const beats = duration / divisions;
  return Number.isFinite(beats) && beats > 0 ? beats : null;
}

function parseMidi(note) {
  const pitch = firstChildNamed(note, "pitch");

  if (pitch === null) {
    return null;
  }

  const step = textOf(firstChildNamed(pitch, "step")).toUpperCase();
  const octave = numberText(firstChildNamed(pitch, "octave"));
  const alterNode = firstChildNamed(pitch, "alter");
  const alter = alterNode === null ? 0 : numberText(alterNode);

  if (
    !(step in STEP_TO_SEMITONE) ||
    !Number.isInteger(octave) ||
    !Number.isInteger(alter)
  ) {
    return null;
  }

  const midi =
    (octave + 1) * 12 +
    STEP_TO_SEMITONE[step] +
    alter;

  return Number.isInteger(midi) && midi >= 0 && midi <= 127
    ? midi
    : null;
}

function compilePartMeasure({
  measure,
  partId,
  divisions,
  measureIndex,
}) {
  let currentDivisions = divisions;
  let cursor = 0;
  const notes = [];

  for (const child of childrenNamed(measure, "attributes")) {
    const divisionsNode = firstChildNamed(child, "divisions");
    if (divisionsNode !== null) {
      const next = numberText(divisionsNode);
      if (!Number.isInteger(next) || next <= 0) {
        return null;
      }
      currentDivisions = next;
    }
  }

  if (!Number.isInteger(currentDivisions) || currentDivisions <= 0) {
    return null;
  }

  for (const child of Array.from(measure.childNodes ?? []).filter(
    (node) => node?.nodeType === 1,
  )) {
    if (localNameOf(child) !== "note") {
      continue;
    }

    const durationBeats = parseDuration(child, currentDivisions);
    if (durationBeats === null) {
      return null;
    }

    const isRest = firstChildNamed(child, "rest") !== null;
    if (!isRest) {
      const midi = parseMidi(child);
      if (midi !== null) {
        const voiceText = textOf(firstChildNamed(child, "voice"));
        notes.push({
          startBeat: cursor,
          durationBeats,
          midi,
          measureIndex,
          partId,
          voice: voiceText.length > 0 ? voiceText : null,
        });
      }
    }

    cursor += durationBeats;
    if (!Number.isFinite(cursor)) {
      return null;
    }
  }

  return {
    divisions: currentDivisions,
    durationBeats: cursor,
    notes,
  };
}

function stableNoteSort(a, b) {
  return (
    a.startBeat - b.startBeat ||
    a.partId.localeCompare(b.partId) ||
    String(a.voice ?? "").localeCompare(String(b.voice ?? "")) ||
    a.midi - b.midi ||
    a.durationBeats - b.durationBeats
  );
}

export function compileApproximateMusicXmlPlayback(
  pkg,
  { parser = createBrowserMusicXmlParser() } = {},
) {
  const xml = pkg?.content?.score?.data;

  if (
    pkg?.content?.score?.format !== "musicxml" ||
    typeof xml !== "string" ||
    xml.length === 0 ||
    sourceBytes(xml) > MAX_PLAYBACK_MUSICXML_BYTES ||
    parser === null ||
    typeof parser?.parse !== "function"
  ) {
    return null;
  }

  let document;

  try {
    document = parser.parse(xml);
  } catch {
    return null;
  }

  const root = document?.documentElement ?? null;

  if (
    root === null ||
    localNameOf(root) !== "score-partwise" ||
    hasDescendantNamed(root, "parsererror")
  ) {
    return null;
  }

  const parts = childrenNamed(root, "part").map((part, index) => ({
    node: part,
    partId:
      typeof part.getAttribute === "function" &&
      part.getAttribute("id")?.trim().length > 0
        ? part.getAttribute("id").trim()
        : `P${index + 1}`,
    measures: childrenNamed(part, "measure"),
    divisions: null,
  }));

  if (parts.length === 0) {
    return null;
  }

  const measureCount = Math.max(
    ...parts.map((part) => part.measures.length),
  );

  const notes = [];
  const measures = [];
  let globalBeat = 0;

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    let measureDuration = 0;
    const measureNotes = [];

    for (const part of parts) {
      const measure = part.measures[measureIndex];
      if (measure === undefined) {
        continue;
      }

      const compiled = compilePartMeasure({
        measure,
        partId: part.partId,
        divisions: part.divisions,
        measureIndex,
      });

      if (compiled === null) {
        return null;
      }

      part.divisions = compiled.divisions;
      measureDuration = Math.max(
        measureDuration,
        compiled.durationBeats,
      );

      for (const note of compiled.notes) {
        measureNotes.push({
          ...note,
          startBeat: globalBeat + note.startBeat,
        });
      }
    }

    if (!Number.isFinite(measureDuration) || measureDuration <= 0) {
      return null;
    }

    measures.push({
      index: measureIndex,
      startBeat: globalBeat,
      endBeat: globalBeat + measureDuration,
    });
    notes.push(...measureNotes);
    globalBeat += measureDuration;
  }

  if (notes.length === 0) {
    return null;
  }

  notes.sort(stableNoteSort);

  try {
    return assertPlaybackPlan(
      {
        schemaVersion: 1,
        quality: PLAYBACK_QUALITIES.APPROXIMATE,
        packageId: pkg.packageId,
        referenceTempoBpm: 120,
        tempoMap: [{ beat: 0, bpm: 120 }],
        measures,
        notes,
      },
      {
        packageId: pkg.packageId,
        allowedQuality: PLAYBACK_QUALITIES.APPROXIMATE,
      },
    );
  } catch {
    return null;
  }
}
