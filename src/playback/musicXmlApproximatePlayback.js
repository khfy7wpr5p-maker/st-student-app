import {
  MAX_PLAYBACK_MEASURES,
  MAX_PLAYBACK_NOTES,
  PLAYBACK_QUALITIES,
  assertPlaybackPlan,
} from "./playbackPlan.js";
import {
  childrenNamed,
  createBrowserMusicXmlParser,
  elementChildren,
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

const EPSILON = 1e-9;

function sourceBytes(value) {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function explicitDurationBeats(node, divisions) {
  const duration = numberText(firstChildNamed(node, "duration"));

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isInteger(divisions) ||
    divisions <= 0
  ) {
    return null;
  }

  const beats = duration / divisions;
  return Number.isFinite(beats) && beats > 0 ? beats : null;
}

function parseWrittenMidi(note) {
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

  return Number.isInteger(midi) ? midi : null;
}

function directTieFlags(note) {
  let start = false;
  let stop = false;

  for (const tie of childrenNamed(note, "tie")) {
    const type =
      typeof tie.getAttribute === "function"
        ? tie.getAttribute("type")
        : null;

    if (type === "start") start = true;
    if (type === "stop") stop = true;
  }

  return { start, stop };
}

function descendantsNamed(node, name, output = []) {
  for (const child of elementChildren(node)) {
    if (localNameOf(child) === name) {
      output.push(child);
    }
    descendantsNamed(child, name, output);
  }

  return output;
}

function numericTempoFromSound(sound) {
  if (typeof sound?.getAttribute !== "function") {
    return null;
  }

  const value = Number(sound.getAttribute("tempo"));
  return Number.isFinite(value) && value > 0 && value <= 1000
    ? value
    : null;
}

function updateAttributes(child, state) {
  const divisionsNode = firstChildNamed(child, "divisions");

  if (divisionsNode !== null) {
    const divisions = numberText(divisionsNode);
    if (!Number.isInteger(divisions) || divisions <= 0) {
      return false;
    }
    state.divisions = divisions;
  }

  const transpose = firstChildNamed(child, "transpose");

  if (transpose !== null) {
    const chromaticNode = firstChildNamed(transpose, "chromatic");
    const octaveNode = firstChildNamed(transpose, "octave-change");
    const chromatic =
      chromaticNode === null ? 0 : numberText(chromaticNode);
    const octaveChange =
      octaveNode === null ? 0 : numberText(octaveNode);

    if (
      !Number.isInteger(chromatic) ||
      !Number.isInteger(octaveChange)
    ) {
      return false;
    }

    state.transposeChromatic = chromatic;
    state.transposeOctave = octaveChange;
  }

  return true;
}

function compilePartMeasure({
  measure,
  part,
  measureIndex,
  nextTempoOrder,
}) {
  let cursor = 0;
  let extent = 0;
  const notes = [];
  const tempos = [];
  const previousNonChordOnsetByVoice = new Map();

  for (const child of elementChildren(measure)) {
    const name = localNameOf(child);

    if (name === "attributes") {
      if (!updateAttributes(child, part)) {
        return null;
      }
      continue;
    }

    if (name === "backup" || name === "forward") {
      const beats = explicitDurationBeats(child, part.divisions);
      if (beats === null) {
        return null;
      }

      if (name === "backup") {
        const next = cursor - beats;
        if (!Number.isFinite(next) || next < -EPSILON) {
          return null;
        }
        cursor = Math.max(0, next);
      } else {
        cursor += beats;
        if (!Number.isFinite(cursor)) {
          return null;
        }
        extent = Math.max(extent, cursor);
      }
      continue;
    }

    if (name === "direction" || name === "sound") {
      const sounds =
        name === "sound"
          ? [child]
          : descendantsNamed(child, "sound");

      for (const sound of sounds) {
        const bpm = numericTempoFromSound(sound);
        if (bpm !== null) {
          tempos.push({
            relativeBeat: cursor,
            bpm,
            order: nextTempoOrder(),
          });
        }
      }
      continue;
    }

    if (name !== "note") {
      continue;
    }

    const durationBeats = explicitDurationBeats(
      child,
      part.divisions,
    );

    if (durationBeats === null) {
      if (firstChildNamed(child, "grace") !== null) {
        continue;
      }
      return null;
    }

    const voiceText = textOf(firstChildNamed(child, "voice"));
    const voice = voiceText.length > 0 ? voiceText : null;
    const voiceKey = voice ?? "";
    const chord = firstChildNamed(child, "chord") !== null;
    let onset = cursor;

    if (chord) {
      if (!previousNonChordOnsetByVoice.has(voiceKey)) {
        return null;
      }
      onset = previousNonChordOnsetByVoice.get(voiceKey);
    } else {
      previousNonChordOnsetByVoice.set(voiceKey, cursor);
    }

    const rest = firstChildNamed(child, "rest") !== null;

    if (!rest) {
      const writtenMidi = parseWrittenMidi(child);

      if (writtenMidi !== null) {
        const midi =
          writtenMidi +
          part.transposeChromatic +
          12 * part.transposeOctave;

        if (Number.isInteger(midi) && midi >= 0 && midi <= 127) {
          const tie = directTieFlags(child);
          notes.push({
            startBeat: onset,
            durationBeats,
            midi,
            measureIndex,
            partId: part.partId,
            voice,
            tieStart: tie.start,
            tieStop: tie.stop,
          });
        }
      }
    }

    extent = Math.max(extent, onset + durationBeats);

    if (!chord) {
      cursor += durationBeats;
      if (!Number.isFinite(cursor)) {
        return null;
      }
      extent = Math.max(extent, cursor);
    }
  }

  if (
    !Number.isInteger(part.divisions) ||
    part.divisions <= 0 ||
    !Number.isFinite(extent)
  ) {
    return null;
  }

  return {
    durationBeats: extent,
    notes,
    tempos,
  };
}

function stableRawNoteSort(a, b) {
  return (
    a.startBeat - b.startBeat ||
    a.partId.localeCompare(b.partId) ||
    String(a.voice ?? "").localeCompare(String(b.voice ?? "")) ||
    a.midi - b.midi ||
    a.durationBeats - b.durationBeats
  );
}

function publicNote(note) {
  return {
    startBeat: note.startBeat,
    durationBeats: note.durationBeats,
    midi: note.midi,
    measureIndex: note.measureIndex,
    partId: note.partId,
    voice: note.voice,
  };
}

function mergeTies(rawNotes) {
  const sorted = [...rawNotes].sort(stableRawNoteSort);
  const active = new Map();
  const output = [];

  const keyOf = (note) =>
    `${note.partId}\u0000${note.voice ?? ""}\u0000${note.midi}`;

  const flushActive = (key) => {
    const pending = active.get(key);
    if (pending !== undefined) {
      output.push(publicNote(pending));
      active.delete(key);
    }
  };

  for (const note of sorted) {
    const key = keyOf(note);
    const pending = active.get(key);

    if (pending !== undefined) {
      const expectedStart =
        pending.startBeat + pending.durationBeats;

      if (
        note.tieStop === true &&
        Math.abs(expectedStart - note.startBeat) <= EPSILON
      ) {
        pending.durationBeats += note.durationBeats;
        if (note.tieStart !== true) {
          flushActive(key);
        }
        continue;
      }

      flushActive(key);
    }

    if (note.tieStart === true) {
      active.set(key, { ...note });
      continue;
    }

    output.push(publicNote(note));
  }

  for (const key of [...active.keys()]) {
    flushActive(key);
  }

  output.sort(stableRawNoteSort);
  return output;
}

function positiveTempo(value) {
  return Number.isFinite(value) && value > 0 && value <= 1000
    ? value
    : null;
}

function buildTempo({
  rawTempoEvents,
  practiceTempo,
}) {
  const byDocumentOrder = [...rawTempoEvents].sort(
    (a, b) => a.order - b.order,
  );
  const firstScoreTempo =
    byDocumentOrder.find((entry) => positiveTempo(entry.bpm) !== null)
      ?.bpm ?? null;
  const teacherTempo = positiveTempo(practiceTempo);
  const referenceTempoBpm =
    teacherTempo ?? firstScoreTempo ?? 120;
  const scale =
    teacherTempo !== null && firstScoreTempo !== null
      ? teacherTempo / firstScoreTempo
      : 1;

  const candidates = [
    { beat: 0, bpm: referenceTempoBpm, order: -1 },
    ...rawTempoEvents.map((entry) => ({
      beat: entry.beat,
      bpm: entry.bpm * scale,
      order: entry.order,
    })),
  ]
    .filter(
      (entry) =>
        Number.isFinite(entry.beat) &&
        entry.beat >= 0 &&
        positiveTempo(entry.bpm) !== null,
    )
    .sort((a, b) => a.beat - b.beat || a.order - b.order);

  const tempoMap = [];

  for (const entry of candidates) {
    const last = tempoMap.at(-1);

    if (last !== undefined && Math.abs(last.beat - entry.beat) <= EPSILON) {
      tempoMap[tempoMap.length - 1] = {
        beat: entry.beat,
        bpm: entry.bpm,
      };
    } else {
      tempoMap.push({ beat: entry.beat, bpm: entry.bpm });
    }
  }

  return { referenceTempoBpm, tempoMap };
}

export function compileApproximateMusicXmlPlayback(
  pkg,
  { parser = createBrowserMusicXmlParser() } = {},
) {
  const xml = pkg?.content?.score?.data;

  if (
    pkg?.content?.score?.format !== "musicxml" ||
    typeof pkg?.packageId !== "string" ||
    pkg.packageId.length === 0 ||
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
    transposeChromatic: 0,
    transposeOctave: 0,
  }));

  if (parts.length === 0) {
    return null;
  }

  const measureCount = Math.max(
    ...parts.map((part) => part.measures.length),
  );

  if (
    measureCount <= 0 ||
    measureCount > MAX_PLAYBACK_MEASURES
  ) {
    return null;
  }

  const rawNotes = [];
  const rawTempoEvents = [];
  const measures = [];
  let globalBeat = 0;
  let tempoOrder = 0;
  const nextTempoOrder = () => tempoOrder++;

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    let measureDuration = 0;
    const measureNotes = [];
    const measureTempos = [];

    for (const part of parts) {
      const measure = part.measures[measureIndex];

      if (measure === undefined) {
        continue;
      }

      const compiled = compilePartMeasure({
        measure,
        part,
        measureIndex,
        nextTempoOrder,
      });

      if (compiled === null) {
        return null;
      }

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

      for (const tempo of compiled.tempos) {
        measureTempos.push({
          beat: globalBeat + tempo.relativeBeat,
          bpm: tempo.bpm,
          order: tempo.order,
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

    rawNotes.push(...measureNotes);
    rawTempoEvents.push(...measureTempos);

    if (rawNotes.length > MAX_PLAYBACK_NOTES) {
      return null;
    }

    globalBeat += measureDuration;

    if (!Number.isFinite(globalBeat)) {
      return null;
    }
  }

  if (rawNotes.length === 0) {
    return null;
  }

  const notes = mergeTies(rawNotes);

  if (notes.length === 0 || notes.length > MAX_PLAYBACK_NOTES) {
    return null;
  }

  const { referenceTempoBpm, tempoMap } = buildTempo({
    rawTempoEvents,
    practiceTempo: pkg.practice?.tempoBpm,
  });

  try {
    return assertPlaybackPlan(
      {
        schemaVersion: 1,
        quality: PLAYBACK_QUALITIES.APPROXIMATE,
        packageId: pkg.packageId,
        referenceTempoBpm,
        tempoMap,
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
