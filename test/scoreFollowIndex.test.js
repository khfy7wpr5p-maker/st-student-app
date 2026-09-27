import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";

import { PLAYBACK_QUALITIES } from "../src/playback/playbackPlan.js";
import { createScoreFollowIndex } from "../src/practice/scoreFollowIndex.js";

const parser = Object.freeze({
  parse(xml) {
    return new DOMParser().parseFromString(xml, "application/xml");
  },
});

function context({
  musicXml,
  quality = PLAYBACK_QUALITIES.APPROXIMATE,
  measures = [{ index: 0, startBeat: 0, endBeat: 4 }],
  notes = [{
    startBeat: 0,
    durationBeats: 4,
    midi: 60,
    measureIndex: 0,
    partId: "P1",
    voice: "1",
  }],
  provenance = true,
} = {}) {
  return Object.freeze({
    plan: Object.freeze({
      schemaVersion: 1,
      quality,
      packageId: "pkg-a",
      referenceTempoBpm: 120,
      tempoMap: Object.freeze([Object.freeze({ beat: 0, bpm: 120 })]),
      measures: Object.freeze(measures.map((item) => Object.freeze({ ...item }))),
      notes: Object.freeze(notes.map((item) => Object.freeze({ ...item }))),
    }),
    timingProvenance: provenance
      ? Object.freeze({
          kind: "EXACT_SCORE_SOURCE",
          musicXml,
        })
      : null,
  });
}

function makeIndex(musicXml, playbackContext = context({ musicXml })) {
  return createScoreFollowIndex({
    packageId: "pkg-a",
    sourceId: "pkg-a",
    musicXml,
    playbackContext,
    parser,
  });
}

const twoPartRestXml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Rest Part</part-name></score-part>
    <score-part id="P2"><part-name>Sound Part</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><rest/><duration>4</duration><voice>1</voice></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

test("rest-only source part remains exact measure membership independent of playable notes", () => {
  const playbackContext = context({
    musicXml: twoPartRestXml,
    notes: [{
      startBeat: 0,
      durationBeats: 4,
      midi: 60,
      measureIndex: 0,
      partId: "P2",
      voice: "1",
    }],
  });
  const index = makeIndex(twoPartRestXml, playbackContext);

  assert.equal(index.measureMapping, "EXACT");
  assert.deepEqual(index.resolveMeasureHit({ partId: "P1", measureIndex: 0 }), {
    measureIndex: 0,
    startBeat: 0,
    endBeat: 4,
    cursorTarget: { partId: "P1", measureIndex: 0 },
  });
  assert.deepEqual(index.resolveMeasureHit({ partId: "P2", measureIndex: 0 }), {
    measureIndex: 0,
    startBeat: 0,
    endBeat: 4,
    cursorTarget: { partId: "P1", measureIndex: 0 },
  });
});

test("unknown source part or measure fails closed", () => {
  const index = makeIndex(twoPartRestXml);

  assert.equal(index.resolveMeasureHit({ partId: "PX", measureIndex: 0 }), null);
  assert.equal(index.resolveMeasureHit({ partId: "P1", measureIndex: 99 }), null);
});

test("invalid source part identity makes measure mapping unavailable instead of guessing", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
    <part><measure number="1"><attributes><divisions>1</divisions></attributes>
      <note><rest/><duration>4</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml, context({ musicXml: xml }));

  assert.equal(index.measureMapping, "UNAVAILABLE");
  assert.equal(index.eventMapping, "UNAVAILABLE");
  assert.equal(index.resolveMeasureHit({ partId: "P1", measureIndex: 0 }), null);
});

test("renderer counting includes rests but rests never become highlight refs", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><rest/><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <forward><duration>1</duration></forward>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.equal(index.eventMapping, "EXACT");
  assert.deepEqual(index.resolveBeat(0).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
  ]);
  assert.deepEqual(index.resolveBeat(1).highlightRefs, []);
  assert.deepEqual(index.resolveBeat(2).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 2, voice: 1 },
  ]);
});

test("same-onset chord members produce one exact active ref set", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.equal(index.eventMapping, "EXACT");
  assert.deepEqual(index.resolveBeat(0).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
    { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 },
  ]);
  assert.deepEqual(index.resolveBeat(2).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 2, voice: 1 },
  ]);
});

test("tied audio can be merged while visual tied segments remain distinct", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1"><attributes><divisions>1</divisions></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="start"/></note>
      </measure>
      <measure number="2">
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="stop"/></note>
      </measure>
    </part>
  </score-partwise>`;
  const playbackContext = context({
    musicXml: xml,
    measures: [
      { index: 0, startBeat: 0, endBeat: 1 },
      { index: 1, startBeat: 1, endBeat: 2 },
    ],
    notes: [{
      startBeat: 0,
      durationBeats: 2,
      midi: 60,
      measureIndex: 0,
      partId: "P1",
      voice: "1",
    }],
  });
  const index = makeIndex(xml, playbackContext);

  assert.deepEqual(index.resolveBeat(0).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
  ]);
  assert.deepEqual(index.resolveBeat(1).highlightRefs, [
    { partId: "P1", measureIndex: 1, noteIndex: 0, voice: 1 },
  ]);
});

test("supported single-staff overlapping voices produce exact active refs", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <backup><duration>2</duration></backup>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>2</voice></note>
      <forward><duration>2</duration></forward>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.equal(index.eventMapping, "EXACT");
  assert.deepEqual(index.resolveBeat(0).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
    { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 2 },
  ]);
});

test("multi-staff traversal keeps measure mapping but disables exact event mapping", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions><staves>2</staves></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.equal(index.measureMapping, "EXACT");
  assert.equal(index.eventMapping, "UNAVAILABLE");
  assert.deepEqual(index.resolveBeat(0), {
    measureIndex: 0,
    cursorTarget: { partId: "P1", measureIndex: 0 },
    highlightRefs: null,
    activeEvents: null,
  });
});

test("FULL playback without exact timing provenance disables highlight only", () => {
  const playbackContext = context({
    musicXml: twoPartRestXml,
    quality: PLAYBACK_QUALITIES.FULL,
    provenance: false,
  });
  const index = makeIndex(twoPartRestXml, playbackContext);

  assert.equal(index.measureMapping, "EXACT");
  assert.equal(index.eventMapping, "UNAVAILABLE");
  assert.notEqual(index.resolveMeasureHit({ partId: "P1", measureIndex: 0 }), null);
  assert.equal(index.resolveBeat(0).highlightRefs, null);
});

test("FULL and APPROXIMATE quality labels do not decide exact highlight authority", () => {
  const full = makeIndex(twoPartRestXml, context({
    musicXml: twoPartRestXml,
    quality: PLAYBACK_QUALITIES.FULL,
    provenance: true,
  }));
  const approximate = makeIndex(twoPartRestXml, context({
    musicXml: twoPartRestXml,
    quality: PLAYBACK_QUALITIES.APPROXIMATE,
    provenance: true,
  }));

  assert.equal(full.eventMapping, "EXACT");
  assert.equal(approximate.eventMapping, "EXACT");
  assert.deepEqual(full.resolveBeat(0).highlightRefs, approximate.resolveBeat(0).highlightRefs);
});

test("mismatched source provenance fails closed even when playback notes appear compatible", () => {
  const playbackContext = context({
    musicXml: twoPartRestXml,
    provenance: false,
  });
  const mismatched = Object.freeze({
    plan: playbackContext.plan,
    timingProvenance: Object.freeze({
      kind: "EXACT_SCORE_SOURCE",
      musicXml: "<score-partwise><part id=\"P1\"/></score-partwise>",
    }),
  });
  const index = makeIndex(twoPartRestXml, mismatched);

  assert.equal(index.eventMapping, "UNAVAILABLE");
  assert.equal(index.resolveBeat(0).highlightRefs, null);
});

test("exact score event exposes trusted F#4 pitch identity and MIDI 66", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <forward><duration>2</duration></forward>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.equal(index.eventMapping, "EXACT");
  assert.deepEqual(index.resolveBeat(0).activeEvents, [{
    eventId: "P1:0:1:0",
    partId: "P1",
    measureIndex: 0,
    midi: 66,
    pitch: { step: "F", alter: 1, octave: 4 },
  }]);
});

test("rest beat exposes no active pitched event", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><rest/><duration>2</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.deepEqual(index.resolveBeat(0).activeEvents, []);
  assert.deepEqual(index.resolveBeat(2).activeEvents, [{
    eventId: "P1:0:1:1",
    partId: "P1",
    measureIndex: 0,
    midi: 62,
    pitch: { step: "D", alter: 0, octave: 4 },
  }]);
});

test("chord members expose distinct simultaneous active events", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <note><chord/><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <forward><duration>2</duration></forward>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.deepEqual(index.resolveBeat(0).activeEvents.map((item) => item.eventId), [
    "P1:0:1:0",
    "P1:0:1:1",
  ]);
  assert.deepEqual(index.resolveBeat(0).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
    { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 },
  ]);
});

test("accompaniment active events preserve their own part identity", () => {
  const xml = `<score-partwise version="4.0">
    <part-list>
      <score-part id="P1"><part-name>Violin</part-name></score-part>
      <score-part id="P2"><part-name>Piano</part-name></score-part>
    </part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure></part>
    <part id="P2"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.deepEqual(
    index.resolveBeat(0).activeEvents.map((item) => item.partId).sort(),
    ["P1", "P2"],
  );
});

test("beat exactly at note end excludes the ended active event", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <forward><duration>2</duration></forward>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.deepEqual(index.resolveBeat(1).activeEvents.map((item) => item.midi), [64]);
});

test("microtonal pitch disables exact event mapping instead of inventing integer MIDI", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>F</step><alter>0.5</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.equal(index.measureMapping, "EXACT");
  assert.equal(index.eventMapping, "UNAVAILABLE");
  assert.deepEqual(index.resolveBeat(0), {
    measureIndex: 0,
    cursorTarget: { partId: "P1", measureIndex: 0 },
    highlightRefs: null,
    activeEvents: null,
  });
});

test("exact event preserves non-zero MusicXML transposition as source metadata", () => {
  const xml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Transposed</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes>
        <divisions>1</divisions>
        <transpose><chromatic>2</chromatic><octave-change>1</octave-change></transpose>
      </attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure></part>
  </score-partwise>`;
  const index = makeIndex(xml);

  assert.equal(index.eventMapping, "EXACT");
  assert.deepEqual(index.resolveBeat(0).activeEvents, [{
    eventId: "P1:0:1:0",
    partId: "P1",
    measureIndex: 0,
    midi: 62,
    pitch: { step: "D", alter: 0, octave: 4 },
    transpositionSemitones: 14,
  }]);
  assert.deepEqual(index.resolveBeat(0).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
  ]);
});
