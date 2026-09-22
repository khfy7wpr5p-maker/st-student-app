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
