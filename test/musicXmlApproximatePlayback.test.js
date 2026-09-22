import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";

import {
  MAX_PLAYBACK_MUSICXML_BYTES,
  compileApproximateMusicXmlPlayback,
} from "../src/playback/musicXmlApproximatePlayback.js";

const parser = Object.freeze({
  parse(xml) {
    return new DOMParser().parseFromString(xml, "application/xml");
  },
});

function pkg(xml, overrides = {}) {
  const base = {
    schemaVersion: "1.0.0",
    packageId: "pkg-a",
    content: {
      score: { format: "musicxml", data: xml },
      canonicalEvents: [],
    },
  };

  return {
    ...base,
    ...overrides,
    content: overrides.content ?? base.content,
  };
}

function score(body, { prefix = "", namespace = false } = {}) {
  const p = prefix ? prefix + ":" : "";
  const ns = namespace
    ? ` xmlns:${prefix || "m"}="http://www.musicxml.org/ns/musicxml"`
    : "";
  return `<?xml version="1.0"?>
<${p}score-partwise${ns} version="4.0">
  <${p}part-list>
    <${p}score-part id="P1"><${p}part-name>Piano</${p}part-name></${p}score-part>
  </${p}part-list>
  ${body}
</${p}score-partwise>`;
}

function onePart(measures, prefix = "") {
  const p = prefix ? prefix + ":" : "";
  return `<${p}part id="P1">${measures}</${p}part>`;
}

test("compiles basic notes, rests, and divisions into beats", () => {
  const xml = score(onePart(`
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
      <note><rest/><duration>2</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
    </measure>
  `));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });

  assert.equal(plan.quality, "APPROXIMATE");
  assert.equal(plan.referenceTempoBpm, 120);
  assert.deepEqual(
    plan.notes.map(({ startBeat, durationBeats, midi }) => [
      startBeat,
      durationBeats,
      midi,
    ]),
    [
      [0, 1, 60],
      [1.5, 0.5, 62],
    ],
  );
  assert.deepEqual(plan.measures, [{ index: 0, startBeat: 0, endBeat: 2 }]);
});

test("aligns parts to one global measure boundary using max part duration", () => {
  const xml = `<score-partwise version="4.0">
    <part-list>
      <score-part id="P1"><part-name>A</part-name></score-part>
      <score-part id="P2"><part-name>B</part-name></score-part>
    </part-list>
    <part id="P1">
      <measure number="1"><attributes><divisions>1</divisions></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      </measure>
      <measure number="2">
        <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
      </measure>
    </part>
    <part id="P2">
      <measure number="1"><attributes><divisions>1</divisions></attributes>
        <note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration></note>
      </measure>
      <measure number="2">
        <note><pitch><step>A</step><octave>3</octave></pitch><duration>1</duration></note>
      </measure>
    </part>
  </score-partwise>`;

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });

  assert.deepEqual(
    plan.notes.map(({ startBeat, midi }) => [startBeat, midi]),
    [[0, 60], [0, 55], [4, 62], [4, 57]],
  );
  assert.deepEqual(plan.measures, [
    { index: 0, startBeat: 0, endBeat: 4 },
    { index: 1, startBeat: 4, endBeat: 5 },
  ]);
});

test("accepts namespace-prefixed MusicXML by local name", () => {
  const xml = score(
    onePart(`
      <m:measure number="1">
        <m:attributes><m:divisions>2</m:divisions></m:attributes>
        <m:note>
          <m:pitch><m:step>E</m:step><m:octave>4</m:octave></m:pitch>
          <m:duration>2</m:duration>
        </m:note>
      </m:measure>
    `, "m"),
    { prefix: "m", namespace: true },
  );

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.deepEqual(plan.notes.map(({ midi }) => midi), [64]);
});

test("oversized playback MusicXML fails closed", () => {
  const xml =
    "<score-partwise>" +
    " ".repeat(MAX_PLAYBACK_MUSICXML_BYTES) +
    "</score-partwise>";

  assert.equal(
    compileApproximateMusicXmlPlayback(pkg(xml), { parser }),
    null,
  );
});

test("score-timewise is not admitted for approximate playback", () => {
  const xml = "<score-timewise version=\"4.0\"><part-list/></score-timewise>";
  assert.equal(
    compileApproximateMusicXmlPlayback(pkg(xml), { parser }),
    null,
  );
});

test("invalid parser result fails closed", () => {
  const badParser = { parse: () => null };
  assert.equal(
    compileApproximateMusicXmlPlayback(pkg("<score-partwise/>"), {
      parser: badParser,
    }),
    null,
  );
});

test("score with no playable pitched notes is unavailable", () => {
  const xml = score(onePart(`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><rest/><duration>4</duration></note>
    </measure>
  `));

  assert.equal(
    compileApproximateMusicXmlPlayback(pkg(xml), { parser }),
    null,
  );
});

test("canonicalEvents never influence approximate playback", () => {
  const xml = score(onePart(`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  `));

  const clean = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  const poisoned = compileApproximateMusicXmlPlayback(
    pkg(xml, {
      content: {
        score: { format: "musicxml", data: xml },
        canonicalEvents: [{
          onset: 999999,
          duration: 999999,
          midi: 127,
        }],
      },
    }),
    { parser },
  );

  assert.deepEqual(poisoned, clean);
});


test("supports chord, backup, and forward polyphony without cursor invention", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <backup><duration>2</duration></backup>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>2</voice></note>
      <forward><duration>1</duration></forward>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice></note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });

  assert.deepEqual(
    plan.notes.map(({ startBeat, durationBeats, midi, voice }) => [
      startBeat, durationBeats, midi, voice,
    ]),
    [
      [0, 1, 60, "1"],
      [0, 1, 64, "1"],
      [0, 2, 67, "2"],
      [1, 1, 62, "1"],
      [3, 1, 69, "2"],
    ],
  );
  assert.deepEqual(plan.measures, [
    { index: 0, startBeat: 0, endBeat: 4 },
  ]);
});

test("backup cursor underflow fails closed", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <backup><duration>1</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  \`));

  assert.equal(
    compileApproximateMusicXmlPlayback(pkg(xml), { parser }),
    null,
  );
});

test("divisions changes are applied in document order", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>2</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
      <attributes><divisions>4</divisions></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.deepEqual(
    plan.notes.map(({ startBeat, durationBeats }) => [startBeat, durationBeats]),
    [[0, 1], [1, 0.5]],
  );
});

test("merges contiguous tie chains by part, voice, and sounding pitch", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><tie type="start"/>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><tie type="stop"/>
      </note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });

  assert.deepEqual(
    plan.notes.map(({ startBeat, durationBeats, midi, measureIndex }) => [
      startBeat, durationBeats, midi, measureIndex,
    ]),
    [[0, 2, 60, 0]],
  );
});

test("unmatched tie stop is a normal note and dangling start keeps explicit duration", () => {
  const unmatched = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration><tie type="stop"/>
      </note>
    </measure>
  \`));
  const dangling = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration><tie type="start"/>
      </note>
    </measure>
  \`));

  assert.deepEqual(
    compileApproximateMusicXmlPlayback(pkg(unmatched), { parser }).notes
      .map(({ durationBeats, midi }) => [durationBeats, midi]),
    [[1, 62]],
  );
  assert.deepEqual(
    compileApproximateMusicXmlPlayback(pkg(dangling), { parser }).notes
      .map(({ durationBeats, midi }) => [durationBeats, midi]),
    [[2, 64]],
  );
});

test("applies chromatic and octave transposition to sounding MIDI", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <transpose>
          <chromatic>2</chromatic>
          <octave-change>1</octave-change>
        </transpose>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.deepEqual(plan.notes.map(({ midi }) => midi), [74]);
});

test("teacher practice tempo scales supported MusicXML tempo map proportionally", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <direction><sound tempo="100"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
      <direction><sound tempo="150"/></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(
    {
      ...pkg(xml),
      practice: { tempoBpm: 80 },
    },
    { parser },
  );

  assert.equal(plan.referenceTempoBpm, 80);
  assert.deepEqual(plan.tempoMap, [
    { beat: 0, bpm: 80 },
    { beat: 2, bpm: 120 },
  ]);
});

test("first supported MusicXML tempo is reference when teacher tempo is absent", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <direction><sound tempo="90"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.equal(plan.referenceTempoBpm, 90);
  assert.deepEqual(plan.tempoMap, [{ beat: 0, bpm: 90 }]);
});

test("invalid tempo metadata is ignored and duplicate beat uses last supported value", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <direction><sound tempo="-1"/></direction>
      <direction><sound tempo="100"/></direction>
      <direction><sound tempo="110"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.equal(plan.referenceTempoBpm, 100);
  assert.deepEqual(plan.tempoMap, [{ beat: 0, bpm: 110 }]);
});

test("explicit duration/divisions preserves tuplet performed length", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>3</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.equal(plan.notes[0].durationBeats, 1 / 3);
});

test("grace without explicit supported duration is ignored without invented time", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.deepEqual(
    plan.notes.map(({ startBeat, durationBeats, midi }) => [
      startBeat, durationBeats, midi,
    ]),
    [[0, 1, 60]],
  );
});

test("ornament, pedal, and repeat metadata do not invent playback jumps", () => {
  const xml = score(onePart(\`
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <direction><direction-type><pedal type="start"/></direction-type></direction>
      <barline location="right"><repeat direction="backward"/></barline>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
        <notations><ornaments><trill-mark/></ornaments></notations>
      </note>
    </measure>
  \`));

  const plan = compileApproximateMusicXmlPlayback(pkg(xml), { parser });
  assert.deepEqual(plan.notes.map(({ startBeat, midi }) => [startBeat, midi]), [
    [0, 60],
  ]);
  assert.equal(plan.measures[0].endBeat, 1);
});

test("measure count above hard limit fails closed", () => {
  const measure = \`<measure><attributes><divisions>1</divisions></attributes><note><rest/><duration>1</duration></note></measure>\`;
  const xml = score(onePart(measure.repeat(10_001)));

  assert.equal(
    compileApproximateMusicXmlPlayback(pkg(xml), { parser }),
    null,
  );
});
