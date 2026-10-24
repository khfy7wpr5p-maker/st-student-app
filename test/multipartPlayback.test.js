import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import "../vendor/st-score-audio/st-score-audio-engine.js";
import { createPlaybackPlanResolver } from "../src/playback/playbackPlanResolver.js";
import { createStudentPlaybackPort } from "../src/playback/studentPlaybackPort.js";
import { createWebAudioPianoEngine } from "../src/playback/webAudioPianoEngine.js";
import { createScoreAudioVoiceAdapter } from "../src/playback/scoreAudioVoiceAdapter.js";

globalThis.DOMParser = DOMParser;

function score({ lead = "lead", bass = "bass", program = 1, reverse = false } = {}) {
  const entry = (id, name, midi) => `<score-part id="${id}"><part-name>${name}</part-name><score-instrument id="${id}-I"><instrument-name>${name}</instrument-name></score-instrument><midi-instrument id="${id}-I"><midi-program>${midi}</midi-program></midi-instrument></score-part>`;
  const part = (id, octave, clef) => `<part id="${id}"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>${clef}</sign><line>${clef === "G" ? 2 : 4}</line></clef></attributes><note><pitch><step>D</step><octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>C</step><octave>${octave}</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note></measure></part>`;
  const entries = [entry(lead, "Keman", 41), entry(bass, "Piyano", program)];
  const bodies = [part(lead, 5, "G"), part(bass, 3, "F")];
  if (reverse) { entries.reverse(); bodies.reverse(); }
  return `<score-partwise version="4.0"><part-list>${entries.join('')}</part-list>${bodies.join('')}</score-partwise>`;
}

function setup(options = {}) {
  const sources = [], intervals = new Map();
  let intervalId = 0;
  const context = {
    state: "running", currentTime: 0, destination: {},
    async resume() { this.state = "running"; },
    async decodeAudioData(bytes) { return { url: new TextDecoder().decode(bytes), duration: 20 }; },
    createGain() { return { connect() {}, gain: { value: 1, setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {} } }; },
    createBufferSource() {
      const node = { buffer: null, starts: [], stops: [], connect() {}, playbackRate: { setValueAtTime() {} }, start(t) { this.starts.push(t); }, stop(t) { this.stops.push(t); } };
      sources.push(node); return node;
    },
  };
  const clock = { setInterval(fn) { intervals.set(++intervalId, fn); return intervalId; }, clearInterval(id) { intervals.delete(id); } };
  const voice = createScoreAudioVoiceAdapter({ runtime: globalThis.STScoreAudioEngine,
    audioContextFactory: () => context,
    fetchImpl: async url => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer }),
  });
  const engine = createWebAudioPianoEngine({ audioContextFactory: () => context, audioContextSupported: true, scoreAudioVoice: voice, clock });
  const resolver = createPlaybackPlanResolver();
  const pkg = { packageId: "two-parts", playbackInstrument: "VIOLIN", approvedRevision: { revisionId: "rev-a" },
    content: { score: { format: "musicxml", data: score(options) }, violin: { schemaVersion: 1, targetPartId: options.lead ?? "lead", position: 1 } },
    practice: { tempoBpm: 60, allowTempoChange: true, allowMeasureRepeat: true } };
  const port = createStudentPlaybackPort({ playbackPlanResolver: resolver, engine });
  return { pkg, port, engine, context, sources, intervals, tick() { for (const fn of intervals.values()) fn(); } };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test("violin and bass piano use their real sample ranges on one transport", async () => {
  const h = setup();
  assert.equal(h.port.canPlayPackage(h.pkg), true);
  await h.port.playPackage(h.pkg);
  await flush();
  assert.equal(h.sources.length, 2);
  assert.ok(h.sources.some(s => s.buffer.url.includes("Solo%20Violin")));
  assert.ok(h.sources.some(s => s.buffer.url.includes("salamander/Ds3.mp3")));
  assert.deepEqual(h.sources.map(s => s.starts[0]), [0.02, 0.02]);
  h.context.currentTime = 0.9; h.tick(); await flush();
  assert.equal(h.sources.length, 4);
  assert.equal(h.sources.filter(s => s.buffer.url.includes("salamander/C3.mp3")).length, 1);
  assert.equal(h.intervals.size, 1);
  h.port.disposePackage(h.pkg);
});

test("part identity rather than P1 or source order determines the violin lane", async () => {
  const h = setup({ lead: "Piano-looking-ID", bass: "Violin-looking-ID", reverse: true });
  await h.port.playPackage(h.pkg); await flush();
  assert.equal(h.sources.length, 2);
  assert.ok(h.sources.some(s => s.buffer.url.includes("Solo%20Violin")));
  assert.ok(h.sources.some(s => s.buffer.url.includes("salamander")));
  h.port.disposePackage(h.pkg);
});

test("an unsupported accompaniment declaration does not become a violin or guessed piano", () => {
  const h = setup({ program: 74 });
  assert.equal(h.port.canPlayPackage(h.pkg), false);
});

test("pause, resume, tempo, repeat and restart retain both lanes on one clock", async () => {
  const h = setup();
  const positions = [];
  const unsubscribe = h.port.subscribePositionForPackage(h.pkg, s => positions.push(s));
  await h.port.playPackage(h.pkg); await flush();
  h.context.currentTime = 0.2;
  h.port.pausePackage(h.pkg);
  assert.equal(h.intervals.size, 0);
  assert.ok(h.sources.every(s => s.stops.length >= 2), "pause stops both native lanes");
  assert.equal(h.engine.getCurrentBeat(), 0.2);
  await h.port.playPackage(h.pkg); await flush();
  assert.equal(h.intervals.size, 1);
  h.port.setTempoForPackage(h.pkg, 120);
  assert.equal(h.engine.getCurrentBeat(), 0.2);
  h.port.setMeasureRepeatEnabledForPackage(h.pkg, true);
  h.port.restartPackage(h.pkg); await flush();
  assert.equal(h.engine.getCurrentBeat(), 0);
  assert.equal(h.sources.length, 4);
  assert.ok(h.sources.slice(-2).some(s => s.buffer.url.includes("Solo%20Violin")));
  assert.ok(h.sources.slice(-2).some(s => s.buffer.url.includes("salamander")));
  h.context.currentTime = 0.5; h.tick(); await flush();
  assert.equal(h.sources.length, 6);
  assert.equal(h.intervals.size, 1);
  assert.ok(positions.some(s => s.playing === true));
  unsubscribe(); h.port.disposePackage(h.pkg);
  assert.equal(h.intervals.size, 0);
  assert.ok(h.sources.every(s => s.stops.length >= 2));
});

test("a stale violin target or an omitted target never reroutes the bass", () => {
  for (const targetPartId of ["missing", undefined]) {
    const h = setup();
    h.pkg.content.violin = targetPartId === undefined ? undefined : { schemaVersion: 1, position: 1, targetPartId };
    assert.equal(h.port.canPlayPackage(h.pkg), false);
    assert.equal(h.sources.length, 0);
  }
});

test("a rest-only violin part still permits the declared piano accompaniment", async () => {
  const h = setup();
  h.pkg.content.score.data = h.pkg.content.score.data.replace(/<part id="lead">[\s\S]*?<\/part>/,
    '<part id="lead"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><rest/><duration>3</duration><voice>1</voice></note></measure></part>');
  await h.port.playPackage(h.pkg); await flush();
  assert.equal(h.sources.length, 1);
  assert.ok(h.sources[0].buffer.url.includes("salamander"));
  h.port.disposePackage(h.pkg);
});

test("the corrected 24-measure pilot keeps all 69 violin and 120 piano events", async () => {
  const h = setup();
  h.pkg.content.score.data = await readFile(new URL('./fixtures/ses248/violin-piano.musicxml', import.meta.url), 'utf8');
  h.pkg.content.violin.targetPartId = 'P1';
  const expected = JSON.parse(await readFile(new URL('./fixtures/ses248/expected-events.json', import.meta.url), 'utf8'));
  const { plan } = h.port.getScoreFollowPlaybackContextForPackage(h.pkg);
  assert.deepEqual(plan.notes, expected);
  assert.equal(plan.measures.length, 24);
  await h.port.playPackage(h.pkg); await flush();
  for (let tick = 1; tick < 720; tick++) {
    h.context.currentTime = tick / 10; h.tick(); await flush();
  }
  assert.equal(h.sources.length, 189);
  assert.equal(h.sources.filter(s => s.buffer.url.includes('Solo%20Violin')).length, 69);
  assert.equal(h.sources.filter(s => s.buffer.url.includes('/salamander/')).length, 120);
  h.port.disposePackage(h.pkg);
});
