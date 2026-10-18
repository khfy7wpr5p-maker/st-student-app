import {
  childrenNamed,
  createBrowserMusicXmlParser,
  elementChildren,
  firstChildNamed,
  hasDescendantNamed,
  localNameOf,
  numberText,
  textOf,
} from "../playback/musicXmlPlaybackDom.js";

const EPSILON = 1e-9;
const PART_ID_MAX_LENGTH = 128;
const STEP_TO_SEMITONE = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

function validIdentity(value, maxLength = PART_ID_MAX_LENGTH) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !value.includes("\u0000")
  );
}

function finiteRange(measure) {
  return (
    measure !== null &&
    typeof measure === "object" &&
    Number.isSafeInteger(measure.index) &&
    measure.index >= 0 &&
    Number.isFinite(measure.startBeat) &&
    Number.isFinite(measure.endBeat) &&
    measure.startBeat >= 0 &&
    measure.endBeat > measure.startBeat
  );
}

function explicitDurationBeats(node, divisions) {
  const duration = numberText(firstChildNamed(node, "duration"));

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isSafeInteger(divisions) ||
    divisions <= 0
  ) {
    return null;
  }

  const beats = duration / divisions;
  return Number.isFinite(beats) && beats > 0 ? beats : null;
}

function explicitVoice(note) {
  const raw = textOf(firstChildNamed(note, "voice"));
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) return null;
  const voice = Number(raw);
  return Number.isSafeInteger(voice) && voice >= 0 ? voice : null;
}

function explicitStaff(note) {
  const staffNode = firstChildNamed(note, "staff");
  if (staffNode === null) return 1;
  const staff = numberText(staffNode);
  return Number.isSafeInteger(staff) && staff >= 1 ? staff : null;
}

function parseWrittenPitch(note) {
  const pitchNode = firstChildNamed(note, "pitch");
  if (pitchNode === null) return null;

  const step = textOf(firstChildNamed(pitchNode, "step")).toUpperCase();
  const octave = numberText(firstChildNamed(pitchNode, "octave"));
  const alterNode = firstChildNamed(pitchNode, "alter");
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

  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    return null;
  }

  return Object.freeze({
    midi,
    pitch: Object.freeze({ step, alter, octave }),
  });
}

function freezeRef(ref) {
  return Object.freeze({ ...ref });
}

function unavailableIndex({ packageId, sourceId }) {
  const resolveNothing = () => null;
  return Object.freeze({
    packageId,
    sourceId,
    measureMapping: "UNAVAILABLE",
    eventMapping: "UNAVAILABLE",
    resolveMeasureHit: resolveNothing,
    resolveBeat: resolveNothing,
  });
}

function parseSource({ musicXml, parser }) {
  let document;

  try {
    document = parser.parse(musicXml);
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

  const parts = [];
  const seenPartIds = new Set();

  for (const partNode of childrenNamed(root, "part")) {
    const rawId =
      typeof partNode.getAttribute === "function"
        ? partNode.getAttribute("id")
        : null;
    const partId = typeof rawId === "string" ? rawId.trim() : "";

    if (
      !validIdentity(partId) ||
      seenPartIds.has(partId)
    ) {
      return null;
    }

    const measures = childrenNamed(partNode, "measure");
    if (measures.length === 0) {
      return null;
    }

    seenPartIds.add(partId);
    parts.push(Object.freeze({ partId, measures }));
  }

  return parts.length > 0 ? Object.freeze(parts) : null;
}

function buildMeasureIndex(parts, planMeasures) {
  const planByIndex = new Map();
  for (const measure of planMeasures) {
    if (!finiteRange(measure) || planByIndex.has(measure.index)) {
      return null;
    }
    planByIndex.set(measure.index, measure);
  }

  const sourceMembers = new Map();

  for (const part of parts) {
    for (
      let measureIndex = 0;
      measureIndex < part.measures.length;
      measureIndex += 1
    ) {
      if (!planByIndex.has(measureIndex)) {
        return null;
      }

      const members = sourceMembers.get(measureIndex) ?? [];
      members.push(part.partId);
      sourceMembers.set(measureIndex, members);
    }
  }

  if (sourceMembers.size === 0) {
    return null;
  }

  const measures = new Map();

  for (const [measureIndex, partIds] of sourceMembers) {
    const plan = planByIndex.get(measureIndex);
    if (plan === undefined || partIds.length === 0) {
      return null;
    }

    measures.set(
      measureIndex,
      Object.freeze({
        measureIndex,
        startBeat: plan.startBeat,
        endBeat: plan.endBeat,
        partIds: Object.freeze([...partIds]),
        cursorTarget: Object.freeze({
          partId: partIds[0],
          measureIndex,
        }),
      }),
    );
  }

  return Object.freeze({
    measures,
    planMeasures: Object.freeze(
      [...planByIndex.values()].sort(
        (a, b) => a.startBeat - b.startBeat || a.index - b.index,
      ),
    ),
  });
}

function updateMeasureAttributes(attributes, state, { maximumStaff = 1 } = {}) {
  const divisionsNode = firstChildNamed(attributes, "divisions");
  if (divisionsNode !== null) {
    const divisions = numberText(divisionsNode);
    if (!Number.isSafeInteger(divisions) || divisions <= 0) {
      return false;
    }
    state.divisions = divisions;
  }

  const stavesNode = firstChildNamed(attributes, "staves");
  if (stavesNode !== null) {
    const staves = numberText(stavesNode);
    if (
      !Number.isSafeInteger(staves) ||
      staves < 1 ||
      staves > maximumStaff
    ) {
      return false;
    }
  }

  const transpose = firstChildNamed(attributes, "transpose");
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

    const transpositionSemitones =
      chromatic + 12 * octaveChange;
    if (!Number.isSafeInteger(transpositionSemitones)) {
      return false;
    }
    state.transpositionSemitones = transpositionSemitones;
  }

  return true;
}

function collectExactEvents({ parts, measureIndex, maximumStaff = 1 }) {
  const events = [];

  for (const part of parts) {
    const state = {
      divisions: null,
      transpositionSemitones: 0,
    };

    for (
      let currentMeasureIndex = 0;
      currentMeasureIndex < part.measures.length;
      currentMeasureIndex += 1
    ) {
      const measure = part.measures[currentMeasureIndex];
      const measureInfo = measureIndex.measures.get(currentMeasureIndex);
      if (measureInfo === undefined) {
        return null;
      }

      let cursor = 0;
      const previousNonChordOnsetByVoice = new Map();
      const voiceIndexes = new Map();

      for (const child of elementChildren(measure)) {
        const name = localNameOf(child);

        if (name === "attributes") {
          if (!updateMeasureAttributes(child, state, { maximumStaff })) {
            return null;
          }
          continue;
        }

        if (name === "backup" || name === "forward") {
          const duration = explicitDurationBeats(child, state.divisions);
          if (duration === null) return null;

          if (name === "backup") {
            const next = cursor - duration;
            if (!Number.isFinite(next) || next < -EPSILON) {
              return null;
            }
            cursor = Math.max(0, next);
          } else {
            cursor += duration;
            if (!Number.isFinite(cursor)) return null;
          }
          continue;
        }

        if (name !== "note") continue;

        if (firstChildNamed(child, "grace") !== null) {
          return null;
        }

        const duration = explicitDurationBeats(child, state.divisions);
        const voice = explicitVoice(child);
        const staff = explicitStaff(child);

        if (
          duration === null ||
          voice === null ||
          staff === null ||
          staff > maximumStaff
        ) {
          return null;
        }

        const chord = firstChildNamed(child, "chord") !== null;
        let onset = cursor;

        if (chord) {
          if (!previousNonChordOnsetByVoice.has(voice)) {
            return null;
          }
          onset = previousNonChordOnsetByVoice.get(voice);
        } else {
          previousNonChordOnsetByVoice.set(voice, cursor);
        }

        const noteIndex = voiceIndexes.get(voice) ?? 0;
        voiceIndexes.set(voice, noteIndex + 1);

        const startBeat = measureInfo.startBeat + onset;
        const endBeat = startBeat + duration;

        if (
          !Number.isFinite(startBeat) ||
          !Number.isFinite(endBeat) ||
          startBeat < measureInfo.startBeat - EPSILON ||
          endBeat > measureInfo.endBeat + EPSILON
        ) {
          return null;
        }

        const rest = firstChildNamed(child, "rest") !== null;
        if (!rest) {
          const writtenPitch = parseWrittenPitch(child);
          if (writtenPitch === null) {
            return null;
          }

          const ref = freezeRef({
            partId: part.partId,
            measureIndex: currentMeasureIndex,
            noteIndex,
            voice,
          });

          events.push(
            Object.freeze({
              startBeat,
              endBeat,
              measureIndex: currentMeasureIndex,
              ref,
              refs: Object.freeze([ref]),
              staff,
              voice,
              noteIndex,
              eventId:
                `${part.partId}:${currentMeasureIndex}:${voice}:${noteIndex}`,
              partId: part.partId,
              midi: writtenPitch.midi,
              pitch: writtenPitch.pitch,
              ...(state.transpositionSemitones === 0
                ? {}
                : {
                    transpositionSemitones:
                      state.transpositionSemitones,
                  }),
            }),
          );
        }

        if (!chord) {
          cursor += duration;
          if (!Number.isFinite(cursor)) return null;
        }
      }
    }
  }

  return Object.freeze(events);
}

function exactRenderKey(event) {
  return [
    event.partId,
    event.measureIndex,
    event.startBeat,
    event.endBeat,
    event.midi,
    event.pitch.step,
    event.pitch.alter,
    event.pitch.octave,
    event.transpositionSemitones ?? 0,
    event.voice,
    event.noteIndex,
  ].join("\u001f");
}

function musicalEventKey(event) {
  return [
    event.partId,
    event.measureIndex,
    event.startBeat,
    event.endBeat,
    event.midi,
    event.pitch.step,
    event.pitch.alter,
    event.pitch.octave,
    event.transpositionSemitones ?? 0,
  ].join("\u001f");
}

function queueBy(events, keyOf) {
  const queues = new Map();
  for (const event of events) {
    const key = keyOf(event);
    const queue = queues.get(key) ?? [];
    queue.push(event);
    queues.set(key, queue);
  }
  return queues;
}

function takeOnly(queues, key) {
  const queue = queues.get(key);
  if (!Array.isArray(queue) || queue.length === 0) return null;
  const event = queue.shift();
  if (queue.length === 0) queues.delete(key);
  return event;
}

function sameMeasureMembership(left, right) {
  if (left.measures.size !== right.measures.size) return false;
  for (const [measureIndex, leftMeasure] of left.measures) {
    const rightMeasure = right.measures.get(measureIndex);
    if (
      rightMeasure === undefined ||
      leftMeasure.startBeat !== rightMeasure.startBeat ||
      leftMeasure.endBeat !== rightMeasure.endBeat ||
      leftMeasure.partIds.length !== rightMeasure.partIds.length ||
      leftMeasure.partIds.some(
        (partId, index) => partId !== rightMeasure.partIds[index],
      )
    ) {
      return false;
    }
  }
  return true;
}

function mapGeneratedTabEvents({ trustedEvents, renderedEvents }) {
  const notationEvents = renderedEvents.filter((event) => event.staff === 1);
  const tabEvents = renderedEvents.filter((event) => event.staff === 2);
  const tabPartIds = new Set(tabEvents.map((event) => event.partId));
  const tabEligibleEvents = trustedEvents.filter(
    (event) => tabPartIds.has(event.partId),
  );
  if (
    notationEvents.length !== trustedEvents.length ||
    tabEvents.length === 0 ||
    tabEvents.length !== tabEligibleEvents.length ||
    renderedEvents.length !== notationEvents.length + tabEvents.length
  ) {
    return null;
  }

  const notationByExactKey = queueBy(notationEvents, exactRenderKey);
  const tabByMusicalKey = queueBy(tabEvents, musicalEventKey);
  const mapped = [];

  for (const trustedEvent of trustedEvents) {
    const notationEvent = takeOnly(
      notationByExactKey,
      exactRenderKey(trustedEvent),
    );
    const tabEvent = takeOnly(
      tabByMusicalKey,
      musicalEventKey(trustedEvent),
    );
    const expectsTab = tabPartIds.has(trustedEvent.partId);
    if (
      notationEvent === null ||
      (expectsTab && tabEvent === null) ||
      (!expectsTab && tabEvent !== null)
    ) return null;

    mapped.push(Object.freeze({
      ...trustedEvent,
      refs: Object.freeze(
        tabEvent === null
          ? [notationEvent.ref]
          : [notationEvent.ref, tabEvent.ref],
      ),
    }));
  }

  return notationByExactKey.size === 0 && tabByMusicalKey.size === 0
    ? Object.freeze(mapped)
    : null;
}

function buildExactEvents({
  parts,
  measureIndex,
  musicXml,
  playbackContext,
  packageId,
  sourceId,
  parser,
}) {
  const provenance = playbackContext?.timingProvenance;
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    provenance.kind !== "EXACT_SCORE_SOURCE" ||
    typeof provenance.musicXml !== "string" ||
    provenance.musicXml.length === 0
  ) {
    return null;
  }

  if (provenance.musicXml === musicXml) {
    return collectExactEvents({ parts, measureIndex });
  }

  if (sourceId !== `${packageId}:guitar-tab`) return null;

  const trustedParts = parseSource({
    musicXml: provenance.musicXml,
    parser,
  });
  if (trustedParts === null) return null;

  const trustedMeasureIndex = buildMeasureIndex(
    trustedParts,
    playbackContext.plan.measures,
  );
  if (
    trustedMeasureIndex === null ||
    !sameMeasureMembership(trustedMeasureIndex, measureIndex)
  ) {
    return null;
  }

  const trustedEvents = collectExactEvents({
    parts: trustedParts,
    measureIndex: trustedMeasureIndex,
  });
  const renderedEvents = collectExactEvents({
    parts,
    measureIndex,
    maximumStaff: 2,
  });
  if (trustedEvents === null || renderedEvents === null) return null;

  return mapGeneratedTabEvents({ trustedEvents, renderedEvents });
}

function sameRef(left, right) {
  return (
    left.partId === right.partId &&
    left.measureIndex === right.measureIndex &&
    left.noteIndex === right.noteIndex &&
    left.voice === right.voice
  );
}

export function createScoreFollowIndex({
  packageId,
  sourceId,
  musicXml,
  playbackContext,
  parser = createBrowserMusicXmlParser(),
} = {}) {
  if (
    !validIdentity(packageId, 256) ||
    !validIdentity(sourceId, 256) ||
    typeof musicXml !== "string" ||
    musicXml.length === 0 ||
    playbackContext === null ||
    typeof playbackContext !== "object" ||
    playbackContext.plan?.packageId !== packageId ||
    !Array.isArray(playbackContext.plan?.measures) ||
    parser === null ||
    typeof parser?.parse !== "function"
  ) {
    return unavailableIndex({ packageId, sourceId });
  }

  const parts = parseSource({ musicXml, parser });
  if (parts === null) {
    return unavailableIndex({ packageId, sourceId });
  }

  const indexedMeasures = buildMeasureIndex(
    parts,
    playbackContext.plan.measures,
  );
  if (indexedMeasures === null) {
    return unavailableIndex({ packageId, sourceId });
  }

  const exactEvents = buildExactEvents({
    parts,
    measureIndex: indexedMeasures,
    musicXml,
    playbackContext,
    packageId,
    sourceId,
    parser,
  });
  const eventMapping = exactEvents === null ? "UNAVAILABLE" : "EXACT";

  function resolveMeasureHit(target) {
    if (
      target === null ||
      typeof target !== "object" ||
      typeof target.partId !== "string" ||
      !Number.isSafeInteger(target.measureIndex) ||
      target.measureIndex < 0
    ) {
      return null;
    }

    const measure = indexedMeasures.measures.get(target.measureIndex);
    if (
      measure === undefined ||
      !measure.partIds.includes(target.partId)
    ) {
      return null;
    }

    return Object.freeze({
      measureIndex: measure.measureIndex,
      startBeat: measure.startBeat,
      endBeat: measure.endBeat,
      cursorTarget: measure.cursorTarget,
    });
  }

  function resolveBeat(beat) {
    if (!Number.isFinite(beat) || beat < 0) {
      return null;
    }

    const planMeasure = indexedMeasures.planMeasures.find(
      (measure) =>
        beat >= measure.startBeat &&
        beat < measure.endBeat,
    );
    if (planMeasure === undefined) {
      return null;
    }

    const measure = indexedMeasures.measures.get(planMeasure.index);
    if (measure === undefined) {
      return null;
    }

    if (exactEvents === null) {
      return Object.freeze({
        measureIndex: measure.measureIndex,
        cursorTarget: measure.cursorTarget,
        highlightRefs: null,
        activeEvents: null,
      });
    }

    const highlightRefs = [];
    const activeEvents = [];
    for (const event of exactEvents) {
      if (
        beat + EPSILON >= event.startBeat &&
        beat < event.endBeat - EPSILON
      ) {
        for (const ref of event.refs) {
          if (!highlightRefs.some((candidate) => sameRef(candidate, ref))) {
            highlightRefs.push(ref);
          }
        }
        activeEvents.push(
          Object.freeze({
            eventId: event.eventId,
            partId: event.partId,
            measureIndex: event.measureIndex,
            midi: event.midi,
            pitch: event.pitch,
            ...(event.transpositionSemitones === undefined
              ? {}
              : {
                  transpositionSemitones:
                    event.transpositionSemitones,
                }),
          }),
        );
      }
    }

    return Object.freeze({
      measureIndex: measure.measureIndex,
      cursorTarget: measure.cursorTarget,
      highlightRefs: Object.freeze(highlightRefs),
      activeEvents: Object.freeze(activeEvents),
    });
  }

  return Object.freeze({
    packageId,
    sourceId,
    measureMapping: "EXACT",
    eventMapping,
    resolveMeasureHit,
    resolveBeat,
  });
}
