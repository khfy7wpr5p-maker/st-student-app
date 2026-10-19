import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { compileApproximateMusicXmlPlayback } from "../src/playback/musicXmlApproximatePlayback.js";
import { createScoreFollowIndex } from "../src/practice/scoreFollowIndex.js";

const parser = { parse: (xml) => new DOMParser().parseFromString(xml, "application/xml") };
const realTab = readFileSync(new URL("./fixtures/score-follow/smellstab-guitar-tab.musicxml", import.meta.url), "utf8");
const combined = `<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><staves>2</staves>
      <clef number="1"><sign>G</sign><line>2</line></clef>
      <clef number="2"><sign>TAB</sign><line>5</line></clef>
    </attributes>
    <note><rest/><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><rest/><duration>1</duration><voice>5</voice><staff>2</staff></note>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>5</voice><staff>2</staff></note>
  </measure></part>
</score-partwise>`;

function indexFor(xml, sourceId = "pkg") {
  const pkg = { packageId: "pkg", content: { score: { format: "musicxml", data: xml } } };
  const plan = compileApproximateMusicXmlPlayback(pkg, { parser });
  assert.ok(plan, "fixture must be playable before testing follow mapping");
  const before = JSON.stringify(plan);
  const index = createScoreFollowIndex({
    packageId: "pkg", sourceId, musicXml: xml, parser,
    playbackContext: { plan, timingProvenance: { kind: "EXACT_SCORE_SOURCE", musicXml: xml } },
  });
  assert.equal(JSON.stringify(plan), before, "follow must not rewrite the playback plan");
  return { index, plan };
}

test("real Smells embedded TAB source maps playback to both exact staff refs", () => {
  for (const sourceId of ["pkg", "pkg:guitar-tab"]) {
    const { index, plan } = indexFor(realTab, sourceId);
    assert.equal(plan.measures.length, 17);
    assert.equal(plan.notes.length, 150, "existing audio timing remains unchanged");
    assert.equal(index.measureMapping, "EXACT");
    assert.equal(index.eventMapping, "EXACT");
    const first = index.resolveBeat(plan.notes[0].startBeat);
    assert.ok(first.activeEvents.length > 0);
    assert.equal(first.highlightRefs.length, first.activeEvents.length * 2);
    assert.deepEqual([...new Set(first.highlightRefs.map((ref) => ref.voice))].sort(), [1, 5]);
  }
});

test("embedded TAB keeps rest offsets and one paired event per source attack", () => {
  const { index } = indexFor(combined);
  assert.equal(index.eventMapping, "EXACT");
  assert.deepEqual(index.resolveBeat(0).highlightRefs, []);
  assert.deepEqual(index.resolveBeat(1).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 },
    { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 5 },
  ]);
  assert.equal(index.resolveBeat(1).activeEvents.length, 1);
});

test("embedded TAB preserves an independent single-staff accompaniment part", () => {
  const xml = combined.replace("</part-list>", '<score-part id="P2"><part-name>Accompaniment</part-name></score-part></part-list>')
    .replace("</score-partwise>", `<part id="P2"><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure></part></score-partwise>`);
  const { index } = indexFor(xml);
  assert.equal(index.eventMapping, "EXACT");
  assert.deepEqual(index.resolveBeat(1).highlightRefs, [
    { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 },
    { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 5 },
    { partId: "P2", measureIndex: 0, noteIndex: 0, voice: 1 },
  ]);
});

test("every explicitly declared TAB part must retain its paired pitched stream", () => {
  const secondPart = combined.match(/<part id="P1">([\s\S]*?)<\/part>/)[0]
    .replace('id="P1"', 'id="P2"')
    .replace(/(<backup>[\s\S]*?)<pitch><step>C<\/step><octave>4<\/octave><\/pitch>/, "$1<rest/>");
  const xml = combined.replace("</part-list>", '<score-part id="P2"><part-name>Guitar 2</part-name></score-part></part-list>')
    .replace("</score-partwise>", secondPart + "</score-partwise>");
  const { index } = indexFor(xml);
  assert.equal(index.measureMapping, "EXACT");
  assert.equal(index.eventMapping, "UNAVAILABLE");
});

test("a late TAB clef cannot retroactively authorize earlier staff-2 events", () => {
  const clef = '<clef number="2"><sign>TAB</sign><line>5</line></clef>';
  const xml = combined.replace(clef, "").replace("</measure>", `<attributes>${clef}</attributes></measure>`);
  const { index } = indexFor(xml);
  assert.equal(index.measureMapping, "EXACT");
  assert.equal(index.eventMapping, "UNAVAILABLE");
});

for (const [name, xml] of [
  ["non-TAB multistaff", combined.replace("<sign>TAB</sign>", "<sign>F</sign>")],
  ["wrong TAB staff number", combined.replace('clef number="2"', 'clef number="3"')],
  ["mismatched pitch", combined.replace(/(<backup>[\s\S]*?<step>)C/, "$1D")],
  ["mismatched duration", combined.replace(/(<backup>[\s\S]*?<pitch>[\s\S]*?<duration>)3/, (_, prefix) => prefix + "2")],
  ["shared voice across staves", combined.replaceAll("<voice>5</voice>", "<voice>1</voice>")],
  ["unsupported third staff", combined.replaceAll("<staff>2</staff>", "<staff>3</staff>")],
  ["missing TAB event", combined.replace(/<note><pitch><step>C<\/step><octave>4<\/octave><\/pitch><duration>3<\/duration><voice>5<\/voice><staff>2<\/staff><\/note>/, "")],
]) {
  test(`embedded TAB rejects ${name} without losing the measure cursor`, () => {
    const { index } = indexFor(xml);
    assert.equal(index.measureMapping, "EXACT");
    assert.equal(index.eventMapping, "UNAVAILABLE");
    assert.equal(index.resolveBeat(1).highlightRefs, null);
    assert.deepEqual(index.resolveBeat(1).cursorTarget, { partId: "P1", measureIndex: 0 });
  });
}
