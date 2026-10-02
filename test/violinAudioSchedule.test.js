import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";

import { createScoreFollowIndex } from "../src/practice/scoreFollowIndex.js";
import { createViolinAudioSchedule } from "../src/playback/violinAudioSchedule.js";

const parser = Object.freeze({
  parse(xml) {
    return new DOMParser().parseFromString(xml, "application/xml");
  },
});

function createIndex(args) {
  return createScoreFollowIndex({ ...args, parser });
}

function context({ musicXml, notes, measures = [{ index: 0, startBeat: 0, endBeat: 4 }] } = {}) {
  return Object.freeze({
    plan: Object.freeze({
      schemaVersion: 1,
      quality: "FULL",
      packageId: "pkg-a",
      referenceTempoBpm: 120,
      tempoMap: Object.freeze([Object.freeze({ beat: 0, bpm: 120 })]),
      measures: Object.freeze(measures.map((item) => Object.freeze({ ...item }))),
      notes: Object.freeze(notes.map((item) => Object.freeze({ ...item }))),
    }),
    timingProvenance: Object.freeze({
      kind: "EXACT_SCORE_SOURCE",
      musicXml,
    }),
  });
}

function schedule({ musicXml, notes, targetPartId = "P1", playbackContext = null, sourceId = "pkg-a" }) {
  return createViolinAudioSchedule({
    pkg: Object.freeze({ packageId: "pkg-a" }),
    sourceId,
    musicXml,
    targetPartId,
    playbackContext: playbackContext ?? context({ musicXml, notes }),
    createIndex,
  });
}

const monophonicXml = `<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
    <score-part id="P2"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions></attributes>
    <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
  </measure></part>
  <part id="P2"><measure number="1">
    <attributes><divisions>1</divisions></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
</score-partwise>`;

const monophonicNotes = Object.freeze([
  Object.freeze({ startBeat: 0, durationBeats: 2, midi: 66, measureIndex: 0, partId: "P1", voice: "1" }),
  Object.freeze({ startBeat: 0, durationBeats: 4, midi: 60, measureIndex: 0, partId: "P2", voice: "1" }),
  Object.freeze({ startBeat: 2, durationBeats: 2, midi: 62, measureIndex: 0, partId: "P1", voice: "1" }),
]);

test("monophonic target produces a deterministic frozen schedule and excludes accompaniment", () => {
  const result = schedule({ musicXml: monophonicXml, notes: monophonicNotes });

  assert.notEqual(result, null);
  assert.equal(result.packageId, "pkg-a");
  assert.equal(result.sourceId, "pkg-a");
  assert.equal(result.targetPartId, "P1");
  assert.deepEqual(result.pitches, [{ midi: 62 }, { midi: 66 }]);
  assert.deepEqual(result.events, [
    {
      sourceEventId: "P1:0:1:0",
      partId: "P1",
      measureIndex: 0,
      startBeat: 0,
      durationBeats: 2,
      midi: 66,
    },
    {
      sourceEventId: "P1:0:1:1",
      partId: "P1",
      measureIndex: 0,
      startBeat: 2,
      durationBeats: 2,
      midi: 62,
    },
  ]);
  assert.equal(result.events.some((event) => event.partId === "P2"), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.pitches), true);
  assert.equal(Object.isFrozen(result.events), true);
  assert.equal(result.pitches.every(Object.isFrozen), true);
  assert.equal(result.events.every(Object.isFrozen), true);
});

test("exact package/source provenance and PlaybackPlan MIDI must match exact source events", () => {
  assert.equal(
    schedule({ musicXml: monophonicXml, notes: monophonicNotes, sourceId: "pkg-b" }),
    null,
  );

  const staleContext = Object.freeze({
    ...context({ musicXml: monophonicXml, notes: monophonicNotes }),
    timingProvenance: Object.freeze({
      kind: "EXACT_SCORE_SOURCE",
      musicXml: "<score-partwise version=\"4.0\"></score-partwise>",
    }),
  });
  assert.equal(
    schedule({ musicXml: monophonicXml, notes: monophonicNotes, playbackContext: staleContext }),
    null,
  );

  const wrongMidiNotes = monophonicNotes.map((note, index) =>
    index === 0 ? Object.freeze({ ...note, midi: 65 }) : note,
  );
  assert.equal(
    schedule({ musicXml: monophonicXml, notes: wrongMidiNotes }),
    null,
  );
});

test("non-zero target transposition fails closed", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions><transpose><chromatic>2</chromatic></transpose></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const notes = [{ startBeat: 0, durationBeats: 4, midi: 62, measureIndex: 0, partId: "P1", voice: "1" }];

  assert.equal(schedule({ musicXml: xml, notes }), null);
});

test("target overlap or source chord ambiguity fails closed", () => {
  const polyphonicXml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice></note>
    </measure></part>
  </score-partwise>`;
  const overlappingNotes = [
    { startBeat: 0, durationBeats: 4, midi: 60, measureIndex: 0, partId: "P1", voice: "1" },
    { startBeat: 0, durationBeats: 4, midi: 64, measureIndex: 0, partId: "P1", voice: "2" },
  ];
  assert.equal(schedule({ musicXml: polyphonicXml, notes: overlappingNotes }), null);

  const chordXml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const incompleteChordPlan = [
    { startBeat: 0, durationBeats: 4, midi: 60, measureIndex: 0, partId: "P1", voice: "1" },
  ];
  assert.equal(schedule({ musicXml: chordXml, notes: incompleteChordPlan }), null);
});

test("missing or ambiguous exact target mapping returns null instead of guessing", () => {
  assert.equal(
    schedule({ musicXml: monophonicXml, notes: monophonicNotes, targetPartId: "PX" }),
    null,
  );

  const ambiguousIndex = () => Object.freeze({
    measureMapping: "EXACT",
    eventMapping: "EXACT",
    listExactEventsForPart() {
      return Object.freeze([
        Object.freeze({ eventId: "a", partId: "P1", measureIndex: 0, startBeat: 0, endBeat: 2, midi: 66 }),
        Object.freeze({ eventId: "b", partId: "P1", measureIndex: 0, startBeat: 0, endBeat: 2, midi: 66 }),
      ]);
    },
  });

  assert.equal(
    createViolinAudioSchedule({
      pkg: { packageId: "pkg-a" },
      sourceId: "pkg-a",
      musicXml: monophonicXml,
      targetPartId: "P1",
      playbackContext: context({ musicXml: monophonicXml, notes: monophonicNotes }),
      createIndex: ambiguousIndex,
    }),
    null,
  );
});