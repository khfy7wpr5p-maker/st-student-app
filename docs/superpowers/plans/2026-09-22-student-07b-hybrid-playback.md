# STUDENT-07B Hybrid Playback Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Student App-owned, offline-capable browser playback runtime that prefers validated trusted timing (`FULL`) and otherwise compiles authorized MusicXML into bounded `APPROXIMATE` playback, using one piano sound family for every part and exposing Play/Pause/Restart, teacher-gated tempo change, and current-measure repeat without coupling playback to notation.

**Architecture:** Keep the existing `playbackPort` as the public Practice Workspace seam. Build a private normalized `PlaybackPlan`, resolve it from an optional trusted provider or a MusicXML approximate compiler, then play it through a same-origin Web Audio piano engine with deterministic local samples. Playback errors stay bounded to playback-related capabilities; notation, authorization, immutable Practice Packages, IndexedDB ownership, and renderer authority remain unchanged.

**Tech Stack:** Vanilla ECMAScript modules, Node.js 24 CI, built-in `node:test` / `node:assert`, browser `DOMParser`, `@xmldom/xmldom@0.9.12` as a dev-only Node test parser, Web Audio API, deterministic PCM16 WAV assets generated in-repo, existing Service Worker / Cache Storage / IndexedDB boundaries.

**Spec:** `docs/superpowers/specs/2026-09-22-student-07b-hybrid-playback-design.md`

## Global Constraints

- Existing `Practice Package v1` schema remains `1.0.0`; no schema change.
- Unknown `content.canonicalEvents` objects are never interpreted as playback timing.
- `FULL` is allowed only for a validated plan returned by an explicitly trusted timing provider.
- Default browser build has no trusted timing provider; supported MusicXML therefore resolves to `APPROXIMATE`.
- All playable voices use the same piano sound family in STUDENT-07B.
- Tempo control range is 20–300 BPM and is visible only when `allowTempoChange === true`.
- Current-measure repeat is visible only when `allowMeasureRepeat === true`.
- Rendering Layer remains presentation-only and is not modified.
- alphaTab is not a STUDENT-07B runtime dependency.
- Playback/sample assets are same-origin static assets; no playback CDN or runtime network dependency.
- Private Practice Packages remain IndexedDB-owned and never enter Cache Storage.
- No Firestore write, Security Rules change, Teacher App change, microphone, MIDI, recording, analytics, background playback, or instrument-specific timbre is added.
- Merge requires exact-head CI, physical iPhone/Safari/VoiceOver acceptance, and explicit human merge approval.
- Playback-specific MusicXML admission cap: `MAX_PLAYBACK_MUSICXML_BYTES = 4 * 1024 * 1024`. Oversized XML remains valid for other capabilities but playback is `UNAVAILABLE`.
- Playback note limit: 100,000.
- Playback measure limit: 10,000.
- Generated piano bank: exactly 12 mono PCM16 WAV files, C4–B4, 44.1 kHz, 2.5 s each, total bank <= 8 MiB.

## Review Focus

1. **MusicXML namespace/prefix variation:** default namespace, prefixed elements, and benign whitespace must produce the same supported plan rather than silently dropping notes. Task 2 adds namespace-agnostic local-name tests.
2. **Polyphony cursor corruption:** malformed `backup` / `forward` sequences must not create negative or non-finite positions or shift other voices unpredictably. Task 3 pins cursor-underflow and bounded-cursor failure.
3. **Stale audio after identity change:** a slow sample load followed by package switch/sign-out/destroy must never start old audio. Task 8 adds generation-invalidation tests.
4. **Tempo change around tempo-map boundaries:** changing the UI reference tempo mid-play must preserve pitch and relative tempo-map ratios without jumping the musical playhead backward. Task 7 adds deterministic fake-clock tests.
5. **Offline partial-cache condition:** notation/package may still work when one piano asset is missing; playback must fail locally without breaking the Practice Workspace. Task 11 pins Service Worker membership and bounded playback failure behavior.

---

## File Structure

### New production modules

- `src/playback/playbackPlan.js` — immutable internal plan constants, normalization, validation, and quality enum.
- `src/playback/musicXmlPlaybackDom.js` — namespace-agnostic DOM helpers and production `DOMParser` seam.
- `src/playback/musicXmlApproximatePlayback.js` — bounded score-partwise MusicXML -> `APPROXIMATE PlaybackPlan`.
- `src/playback/playbackPlanResolver.js` — trusted FULL plan precedence and explicit-null approximate fallback.
- `src/playback/pianoSampleBank.js` — manifest loading, integrity-aware configuration, MIDI -> C4–B4 sample mapping.
- `src/playback/webAudioPianoEngine.js` — sample decoding, look-ahead scheduler, pause/resume/restart/tempo/repeat.
- `src/playback/studentPlaybackPort.js` — existing Practice Workspace playback-port API over resolver + engine.

### New generation/static assets

- `scripts/generate-st-piano-bank.mjs` — deterministic 12-note PCM16 WAV generator and manifest writer.
- `vendor/st-piano/runtime-manifest.json`
- `vendor/st-piano/THIRD_PARTY_NOTICES.md`
- `vendor/st-piano/LICENSE.txt`
- `vendor/st-piano/samples/C4.wav` through `B4.wav`

The generated WAV bank contains no third-party recordings. `LICENSE.txt` states that the files are deterministically synthesized by this repository's generator and contain no externally sourced audio sample material. `THIRD_PARTY_NOTICES.md` therefore records “none for audio content” while preserving a provenance line pointing to `scripts/generate-st-piano-bank.mjs` and the generator commit.

### Existing integration files

- `package.json`, `package-lock.json`
- `src/practice/practiceWorkspace.js`
- `src/ui/studentAppController.js`
- `src/ui/renderPracticeWorkspace.js`
- `src/ui/main.js`
- `src/ui/mountStudentApp.js`
- `service-worker.js`
- `README.md`
- `docs/architecture.md`

### New tests

- `test/playbackPlan.test.js`
- `test/musicXmlApproximatePlayback.test.js`
- `test/playbackPlanResolver.test.js`
- `test/pianoSampleBank.test.js`
- `test/webAudioPianoEngine.test.js`
- `test/studentPlaybackPort.test.js`
- `test/studentPlaybackLifecycle.test.js`
- `test/playbackOfflineAssets.test.js`

Existing tests updated only where observable STUDENT-07B behavior changes:
- `test/practiceCapabilities.test.js`
- `test/practiceWorkspace.test.js`
- `test/studentAppController.test.js`
- `test/renderStudentApp.test.js`
- `test/studentAppAccessibilityAcceptance.test.js`
- `test/staticShell.test.js`

---

### Task 1: PlaybackPlan Contract and Validator

**Files:**
- Create: `src/playback/playbackPlan.js`
- Create: `test/playbackPlan.test.js`

**Interfaces:**
- Produces:
  - `PLAYBACK_QUALITIES = { FULL: "FULL", APPROXIMATE: "APPROXIMATE" }`
  - `MAX_PLAYBACK_NOTES = 100000`
  - `MAX_PLAYBACK_MEASURES = 10000`
  - `validatePlaybackPlan(plan, { packageId, allowedQuality = null }) -> { ok, plan, errors }`
  - `assertPlaybackPlan(plan, options) -> frozen PlaybackPlan`
- Consumes: none.

- [ ] **Step 1: Write failing validation tests**

Create tests for:
- valid APPROXIMATE plan freezes nested arrays/items;
- valid FULL plan with exact package identity;
- package mismatch;
- unsupported quality;
- non-finite `startBeat`, `durationBeats`, tempo and measure values;
- MIDI not integer or outside 0..127;
- unordered tempo map;
- overlapping/unordered measures;
- note count > 100,000;
- measure count > 10,000;
- zero notes.

Representative test:

```js
test("playback plan rejects package identity mismatch", () => {
  const result = validatePlaybackPlan(makePlan({ packageId: "pkg-a" }), {
    packageId: "pkg-b",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /packageId/);
});
```

- [ ] **Step 2: Run focused test and confirm RED**

Run:

```bash
node --test test/playbackPlan.test.js
```

Expected: FAIL with module-not-found for `src/playback/playbackPlan.js`.

- [ ] **Step 3: Implement the minimal plan contract**

Use explicit normalization rather than accepting caller-owned arrays:

```js
export const PLAYBACK_QUALITIES = Object.freeze({
  FULL: "FULL",
  APPROXIMATE: "APPROXIMATE",
});

export const MAX_PLAYBACK_NOTES = 100_000;
export const MAX_PLAYBACK_MEASURES = 10_000;

export function validatePlaybackPlan(plan, { packageId, allowedQuality = null }) {
  // Collect deterministic bounded errors.
  // Require schemaVersion === 1, exact packageId, allowed quality,
  // positive reference tempo, sorted finite tempoMap, ordered measures,
  // valid MIDI notes and at least one playable note.
}

export function assertPlaybackPlan(plan, options) {
  const result = validatePlaybackPlan(plan, options);
  if (!result.ok) throw new TypeError("invalid playback plan");
  return result.plan;
}
```

Do not include caller error detail in the thrown public message.

- [ ] **Step 4: Re-run focused test**

Run:

```bash
node --test test/playbackPlan.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full suite**

Run:

```bash
npm test
```

Expected: all pre-existing tests plus Task 1 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/playback/playbackPlan.js test/playbackPlan.test.js
git commit -m "feat: add playback plan contract"
```

---

### Task 2: MusicXML DOM Seam and Basic Approximate Compilation

**Files:**
- Create: `src/playback/musicXmlPlaybackDom.js`
- Create: `src/playback/musicXmlApproximatePlayback.js`
- Create: `test/musicXmlApproximatePlayback.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes:
  - `assertPlaybackPlan(...)`
  - `PLAYBACK_QUALITIES.APPROXIMATE`
- Produces:
  - `MAX_PLAYBACK_MUSICXML_BYTES = 4 * 1024 * 1024`
  - `createBrowserMusicXmlParser() -> { parse(xml): Document }`
  - `compileApproximateMusicXmlPlayback(pkg, { parser } = {}) -> PlaybackPlan | null`

- [ ] **Step 1: Add the dev-only XML parser for Node tests**

Run:

```bash
npm install --save-dev @xmldom/xmldom@0.9.12
```

Verify `package-lock.json` records exactly `0.9.12` and that no runtime dependency is added.

- [ ] **Step 2: Write RED tests for the basic supported subset**

Use `@xmldom/xmldom` only in tests:

```js
import { DOMParser } from "@xmldom/xmldom";

const parser = {
  parse(xml) {
    return new DOMParser().parseFromString(xml, "application/xml");
  },
};
```

Cover:
- one part / one measure / quarter notes;
- rests advancing time;
- divisions conversion;
- two parts starting at global beat 0 and aligned by global measure boundary;
- next measure starts after max duration across parts;
- default namespace;
- prefixed MusicXML elements using local-name traversal;
- source > 4 MiB returns `null`;
- `score-timewise` returns `null`;
- malformed parser result returns `null`;
- no pitched notes returns `null`;
- `canonicalEvents` with plausible onset/duration fields does not affect output.

Representative fixture:

```xml
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>4</duration><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>
```

- [ ] **Step 3: Run the new test and confirm RED**

```bash
node --test test/musicXmlApproximatePlayback.test.js
```

Expected: FAIL because compiler modules do not exist.

- [ ] **Step 4: Implement namespace-agnostic DOM helpers**

`musicXmlPlaybackDom.js` should expose helpers that compare `node.localName || node.nodeName.split(":").at(-1)` and iterate element children without CSS selectors. Production default:

```js
export function createBrowserMusicXmlParser() {
  return Object.freeze({
    parse(xml) {
      if (typeof DOMParser !== "function") return null;
      return new DOMParser().parseFromString(xml, "application/xml");
    },
  });
}
```

Parser-error detection must support browser `parsererror` nodes and return `null` on malformed documents.

- [ ] **Step 5: Implement the basic compiler**

Rules:
- verify `pkg.content.score.format === "musicxml"`;
- byte-cap with `new TextEncoder().encode(xml).byteLength`;
- require root local name `score-partwise`;
- compile each part measure-by-measure;
- use current `divisions` (must be positive finite integer);
- plain pitched notes calculate MIDI from step/alter/octave;
- rests and pitched notes advance local cursor by explicit `duration / divisions`;
- each global measure length is the maximum local part duration;
- output deterministic notes sorted by `startBeat`, `partId`, `voice`, `midi`;
- default initial tempo 120 unless Task 3 later replaces it from supported package/MusicXML data.

- [ ] **Step 6: Run focused test**

```bash
node --test test/musicXmlApproximatePlayback.test.js
```

Expected: PASS basic subset tests.

- [ ] **Step 7: Run full suite and commit**

```bash
npm test
git add package.json package-lock.json src/playback/musicXmlPlaybackDom.js src/playback/musicXmlApproximatePlayback.js test/musicXmlApproximatePlayback.test.js
git commit -m "feat: compile basic approximate MusicXML playback"
```

---

### Task 3: Polyphony, Ties, Transposition, Tempo Map, and Compiler Bounds

**Files:**
- Modify: `src/playback/musicXmlApproximatePlayback.js`
- Modify: `test/musicXmlApproximatePlayback.test.js`

**Interfaces:**
- Consumes: Task 2 compiler.
- Produces: final STUDENT-07B approximate compiler behavior.

- [ ] **Step 1: Add RED tests for polyphonic timing**

Add fixtures proving:
- `chord` note shares previous non-chord onset and does not advance cursor;
- `backup` rewinds by explicit duration and enables second voice;
- `forward` advances explicitly;
- backup underflow fails the entire approximate plan;
- non-finite/unbounded cursor fails;
- voice values are preserved as string or `null`.

Expected independent values:

```js
assert.deepEqual(
  plan.notes.map(({ startBeat, durationBeats, midi }) => [
    startBeat, durationBeats, midi,
  ]),
  [
    [0, 1, 60],
    [0, 1, 64],
    [0, 2, 67],
    [1, 1, 62],
  ],
);
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test test/musicXmlApproximatePlayback.test.js
```

Expected: new chord/polyphony cases FAIL.

- [ ] **Step 3: Implement cursor/chord semantics**

Maintain per-part measure cursor and `previousNonChordOnset`. Reject:
- `backup` below zero;
- missing/non-positive duration for note/rest/backup/forward where required;
- any cursor or duration that becomes non-finite.

- [ ] **Step 4: Add RED tests for tie merging and transposition**

Cover:
- tie start + tie stop same `partId + voice + sounding MIDI` merges contiguous duration;
- unmatched tie stop remains a normal note rather than inventing earlier duration;
- dangling tie start closes at its accumulated explicit duration;
- `transpose/chromatic`;
- `transpose/octave-change`;
- both together use:

```js
soundingMidi = writtenMidi + chromatic + (12 * octaveChange);
```

- [ ] **Step 5: Implement tie/transposition behavior and re-run focused tests**

Run:

```bash
node --test test/musicXmlApproximatePlayback.test.js
```

Expected: PASS.

- [ ] **Step 6: Add RED tests for tempo priority and relative scaling**

Cover:
- package `practice.tempoBpm` wins as initial/reference tempo;
- otherwise first numeric MusicXML `<sound tempo="...">` wins;
- otherwise 120;
- later numeric tempo changes populate `tempoMap`;
- if MusicXML starts at 100 and package tempo is 80, a later score tempo 150 becomes 120 in the plan, preserving the 1.5 ratio;
- invalid/non-positive tempo metadata is ignored;
- tuplet duration represented by explicit MusicXML duration/divisions stays exact.

- [ ] **Step 7: Implement tempo map**

Keep tempo-map entries sorted by beat. Duplicate changes at the same beat resolve deterministically to the last supported numeric value encountered in document order before plan validation.

- [ ] **Step 8: Add RED tests for hard bounds and unsupported material**

Cover:
- >100,000 notes returns `null`;
- >10,000 measures returns `null`;
- unpitched-only/percussion-only score returns `null`;
- grace note with no supported duration is ignored, not assigned invented duration;
- ornaments, articulations, pedal, repeats/voltas/D.C./D.S. metadata do not create extra events or jumps.

- [ ] **Step 9: Implement bounds and unsupported-semantic policy**

Do not create score-repeat/navigation execution. Unsupported metadata is ignored only when supported pitched note timing remains self-contained.

- [ ] **Step 10: Run focused and full suites**

```bash
node --test test/musicXmlApproximatePlayback.test.js
npm test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/playback/musicXmlApproximatePlayback.js test/musicXmlApproximatePlayback.test.js
git commit -m "feat: support bounded polyphonic approximate playback"
```

---

### Task 4: Trusted/Approximate PlaybackPlan Resolver

**Files:**
- Create: `src/playback/playbackPlanResolver.js`
- Create: `test/playbackPlanResolver.test.js`

**Interfaces:**
- Consumes:
  - `assertPlaybackPlan`
  - `compileApproximateMusicXmlPlayback`
- Produces:
  - `createPlaybackPlanResolver({ trustedTimingProvider = null, approximateCompiler = compileApproximateMusicXmlPlayback })`
  - returned `resolvePackage(pkg) -> PlaybackPlan | null`

- [ ] **Step 1: Write RED resolver tests**

Cases:
- valid trusted FULL plan wins;
- trusted provider explicit `null` falls back to approximate;
- trusted provider returns APPROXIMATE -> fail closed, no fallback;
- trusted provider returns invalid FULL -> fail closed, no fallback;
- trusted provider throws -> fail closed, no fallback;
- no provider -> approximate;
- approximate compiler returns `null` -> `null`;
- `canonicalEvents` alone cannot enable playback.

- [ ] **Step 2: Run RED**

```bash
node --test test/playbackPlanResolver.test.js
```

Expected: module-not-found.

- [ ] **Step 3: Implement resolver**

Core distinction:

```js
if (trustedTimingProvider !== null) {
  const trusted = trustedTimingProvider.resolveTrustedPlan(pkg);
  if (trusted !== null) {
    return assertPlaybackPlan(trusted, {
      packageId: pkg.packageId,
      allowedQuality: PLAYBACK_QUALITIES.FULL,
    });
  }
}

return approximateCompiler(pkg);
```

Catch trusted provider errors at the resolver boundary and return `null`; do not call approximate fallback after an error/invalid non-null trusted result.

- [ ] **Step 4: Run focused/full tests and commit**

```bash
node --test test/playbackPlanResolver.test.js
npm test
git add src/playback/playbackPlanResolver.js test/playbackPlanResolver.test.js
git commit -m "feat: resolve full or approximate playback plans"
```

---

### Task 5: Deterministic Local Piano Sample Bank

**Files:**
- Create: `scripts/generate-st-piano-bank.mjs`
- Create generated: `vendor/st-piano/runtime-manifest.json`
- Create generated: `vendor/st-piano/LICENSE.txt`
- Create generated: `vendor/st-piano/THIRD_PARTY_NOTICES.md`
- Create generated: `vendor/st-piano/samples/C4.wav`, `Cs4.wav`, `D4.wav`, `Ds4.wav`, `E4.wav`, `F4.wav`, `Fs4.wav`, `G4.wav`, `Gs4.wav`, `A4.wav`, `As4.wav`, `B4.wav`
- Create: `test/pianoSampleBank.test.js`

**Interfaces:**
- Produces a static 12-note sample bank and integrity manifest.
- No third-party audio input.

- [ ] **Step 1: Write RED static-asset tests**

Tests require:
- exactly the 12 filenames above;
- RIFF/WAVE PCM16 mono header;
- sample rate 44,100 Hz;
- duration exactly 110,250 frames (2.5 s);
- total WAV bytes <= 8 MiB;
- manifest lists every sample with SHA-256 + byte length + reference MIDI 60..71;
- actual bytes/hash equal manifest;
- `LICENSE.txt` and `THIRD_PARTY_NOTICES.md` exist;
- notices contain no external sample/CDN dependency.

- [ ] **Step 2: Run RED**

```bash
node --test test/pianoSampleBank.test.js
```

Expected: missing generator/assets.

- [ ] **Step 3: Implement deterministic generator**

Use only Node built-ins. For MIDI `m`:

```js
const frequency = 440 * (2 ** ((m - 69) / 12));
```

Generate each sample as a normalized, deterministic piano-like additive waveform:

```js
const t = frame / 44100;
const attack = Math.min(1, t / 0.006);
const decay = Math.exp(-2.2 * t);
const release = t < 2.2 ? 1 : Math.max(0, (2.5 - t) / 0.3);
const inharmonicity = 0.00035;

const partials = [
  [1, 1.00, 1.00],
  [2, 0.46, 1.35],
  [3, 0.23, 1.75],
  [4, 0.13, 2.15],
  [5, 0.08, 2.60],
  [6, 0.05, 3.10],
];

sample = attack * decay * release *
  sum(partials.map(([n, amp, damp]) =>
    amp *
    Math.exp(-damp * 0.22 * t) *
    Math.sin(2 * Math.PI * frequency * n *
      Math.sqrt(1 + inharmonicity * n * n) * t)
  ));
```

Normalize the complete waveform to peak 0.82, encode little-endian signed PCM16, and write standard 44-byte WAV headers. Do not use randomness.

Manifest shape:

```json
{
  "schemaVersion": 1,
  "generator": "scripts/generate-st-piano-bank.mjs",
  "format": "audio/wav; codecs=1",
  "sampleRate": 44100,
  "channels": 1,
  "bitsPerSample": 16,
  "durationFrames": 110250,
  "samples": [
    {
      "midi": 60,
      "file": "samples/C4.wav",
      "bytes": 220544,
      "sha256": "<64 lowercase hex>"
    }
  ]
}
```

The script computes `bytes` and `sha256` from the generated file before writing the manifest.

- [ ] **Step 4: Generate bank and inspect size**

Run:

```bash
node scripts/generate-st-piano-bank.mjs
du -sh vendor/st-piano
```

Expected: generation succeeds; bank <= 8 MiB.

- [ ] **Step 5: Run deterministic regeneration check**

Run generator twice and verify:

```bash
git diff --exit-code -- vendor/st-piano
```

Expected: exit 0 after the second generation.

- [ ] **Step 6: Run focused/full tests and commit**

```bash
node --test test/pianoSampleBank.test.js
npm test
git add scripts/generate-st-piano-bank.mjs vendor/st-piano test/pianoSampleBank.test.js
git commit -m "feat: add deterministic local piano sample bank"
```

---

### Task 6: Piano Sample Bank Loader and MIDI Mapping

**Files:**
- Create: `src/playback/pianoSampleBank.js`
- Modify: `test/pianoSampleBank.test.js`

**Interfaces:**
- Produces:
  - `createPianoSampleBank({ manifestUrl = "./vendor/st-piano/runtime-manifest.json", fetchImpl = globalThis.fetch })`
  - `bank.initialize() -> Promise<boolean>` — fetch/validate manifest without creating AudioContext or decoding samples
  - `bank.isConfigured() -> boolean` — true only after successful manifest initialization and before any known failed state
  - `bank.load(audioContext) -> Promise<void>` — fetch/decode sample bytes only after explicit playback starts
  - `bank.resolveMidi(midi) -> { buffer, playbackRate, referenceMidi }`
  - `bank.dispose() -> void`

- [ ] **Step 1: Add RED loader/mapping tests**

With fake `fetchImpl` and fake `audioContext.decodeAudioData`, prove:
- `initialize()` fetches only the manifest and validates a same-origin relative manifest/sample graph without creating an AudioContext;
- missing/invalid manifest makes `initialize()` return false and `isConfigured()` remain false;
- exactly MIDI 60..71 manifest references;
- `load(audioContext)` performs the 12 sample fetch/decode operations once and decoded buffers are reused;
- MIDI 48 resolves reference C4 / playbackRate 0.5;
- MIDI 60 resolves 1;
- MIDI 72 resolves 2;
- MIDI 61 uses Cs4 reference;
- repeated load is single-flight;
- failed fetch/decode moves bank to failed state and later `isConfigured`/load cannot pretend ready until new bank instance/reload;
- `dispose` invalidates slow stale load completion.

Mapping formula:

```js
const pitchClass = ((midi % 12) + 12) % 12;
const referenceMidi = 60 + pitchClass;
const playbackRate = 2 ** ((midi - referenceMidi) / 12);
```

- [ ] **Step 2: Run RED**

```bash
node --test test/pianoSampleBank.test.js
```

- [ ] **Step 3: Implement loader**

Do not trust manifest hashes at runtime as the sole security boundary; source integrity is enforced by committed manifest tests/CI. `initialize()` must validate manifest shape, 12 entries, bounded declared bytes, exact MIDI 60..71 coverage, and relative same-origin file paths. `load(audioContext)` must validate successful fetch/decode and then retain decoded buffers. A load/decode failure moves the bank into a failed state until a new bank instance/reload.

- [ ] **Step 4: Run focused/full tests and commit**

```bash
node --test test/pianoSampleBank.test.js
npm test
git add src/playback/pianoSampleBank.js test/pianoSampleBank.test.js
git commit -m "feat: load local piano samples"
```

---

### Task 7: Web Audio Engine — Play, Pause, Restart, Tempo Map

**Files:**
- Create: `src/playback/webAudioPianoEngine.js`
- Create: `test/webAudioPianoEngine.test.js`

**Interfaces:**
- Consumes:
  - validated PlaybackPlan;
  - loaded piano sample bank.
- Produces:
  - `createWebAudioPianoEngine({ audioContextFactory, sampleBank, clock = globalThis })`
  - `isSupported() -> boolean` — requires an available AudioContext constructor boundary and initialized/non-failed sample bank
  - `play({ plan, tempoBpm })`
  - `pause()`
  - `restart()`
  - `setTempo(bpm)`
  - `getCurrentBeat()`
  - `dispose()`

- [ ] **Step 1: Build a deterministic fake audio boundary in tests**

Fake only the real Web Audio seam:
- controllable `currentTime`;
- `createBufferSource`;
- `createGain`;
- recorded `start(when, offset?)`, `stop()`, `playbackRate.value`;
- fake timer queue for scheduler ticks.

Do not mock beat-to-time calculations.

- [ ] **Step 2: Write RED tests for tempo integration**

Pin a plan with:
- reference tempo 120;
- tempo map at beat 0 -> 120, beat 4 -> 60;
- notes at beats 0, 2, 4, 6.

Expected musical-time conversion:

```js
beat 0 -> 0 s
beat 2 -> 1 s
beat 4 -> 2 s
beat 6 -> 4 s
```

At UI tempo 60, durations double while sample `playbackRate` stays unchanged.

- [ ] **Step 3: Write RED play/pause/resume/restart tests**

Prove:
- AudioContext resume occurs only inside explicit `play`;
- look-ahead schedules only notes inside a bounded 250 ms horizon;
- pause stops active sources and preserves beat;
- next play resumes from preserved beat;
- restart with repeat off resets beat 0 and starts/resumes playback from beat 0;
- restart with repeat on starts/resumes playback from the captured repeat-measure start;
- starting another plan stops previous sources first;
- repeated play does not duplicate active scheduler loops.

- [ ] **Step 4: Implement beat/seconds conversion and scheduler**

Use constants:

```js
const LOOKAHEAD_MS = 50;
const SCHEDULE_AHEAD_SECONDS = 0.25;
const MIN_TEMPO_BPM = 20;
const MAX_TEMPO_BPM = 300;
```

Create one master GainNode with conservative default gain `0.16` so ordinary chords do not saturate the destination, then build a piecewise integral over the plan tempo map, multiplied by:

```js
tempoScale = plan.referenceTempoBpm / selectedTempoBpm;
```

Tempo changes during playback:
1. snapshot current beat from old timing transform;
2. stop future scheduled sources;
3. set new selected tempo;
4. re-anchor wall clock to the same musical beat;
5. reschedule.

Never modify sample `playbackRate` for tempo control; it is used only for pitch mapping.

- [ ] **Step 5: Add click-safe envelope**

For every note:
- gain starts at 0;
- ramps to 1 within 5 ms;
- holds;
- ramps to 0 during the final 12 ms;
- source stops after the envelope.

Bound note audible duration to at least 20 ms to keep ramps valid.

- [ ] **Step 6: Run focused/full tests and commit**

```bash
node --test test/webAudioPianoEngine.test.js
npm test
git add src/playback/webAudioPianoEngine.js test/webAudioPianoEngine.test.js
git commit -m "feat: add Web Audio playback scheduler"
```

---

### Task 8: Current-Measure Repeat and Stale-Generation Lifecycle

**Files:**
- Modify: `src/playback/webAudioPianoEngine.js`
- Modify: `test/webAudioPianoEngine.test.js`
- Create: `test/studentPlaybackLifecycle.test.js`

**Interfaces:**
- Extends engine:
  - `setMeasureRepeatEnabled(enabled)`
  - `getRepeatMeasureIndex() -> number | null`
- Later port will call these methods.

- [ ] **Step 1: Add RED measure-repeat tests**

Cases:
- enabling before playback captures first measure;
- enabling during measure 3 captures measure 3;
- scheduler wraps from that measure `endBeat` to `startBeat`;
- restart while repeat enabled returns to captured measure start;
- disabling repeat before boundary continues into next measure;
- disabling after loop wrap continues from current loop position;
- plan with no measures cannot enable repeat.

- [ ] **Step 2: Implement measure repeat**

Find containing measure using:

```js
measure.startBeat <= beat && beat < measure.endBeat
```

For exact score-end beat, use the final measure. The repeat domain is captured once on enable and does not follow the playhead to another measure until repeat is disabled and re-enabled.

- [ ] **Step 3: Add RED stale-generation tests**

Simulate:
- `play(planA)` waits on slow sample bank load;
- `dispose()` occurs;
- sample load resolves;
- no source starts and no scheduler timer remains.

Also:
- `play(planA)` pending;
- `play(planB)` supersedes it;
- plan A completion cannot sound.

- [ ] **Step 4: Implement monotonically increasing engine generation**

Every `play` ownership change and `dispose` increments generation. Async load continuation captures generation and exits if stale before creating/scheduling audio nodes.

- [ ] **Step 5: Run focused/full tests and commit**

```bash
node --test test/webAudioPianoEngine.test.js test/studentPlaybackLifecycle.test.js
npm test
git add src/playback/webAudioPianoEngine.js test/webAudioPianoEngine.test.js test/studentPlaybackLifecycle.test.js
git commit -m "feat: add measure repeat and playback lifecycle safety"
```

---

### Task 9: Student Playback Port

**Files:**
- Create: `src/playback/studentPlaybackPort.js`
- Create: `test/studentPlaybackPort.test.js`

**Interfaces:**
- Consumes:
  - `playbackPlanResolver.resolvePackage(pkg)`
  - Web Audio engine.
- Produces existing + new methods:
  - `canPlayPackage(pkg)`
  - `playPackage(pkg)`
  - `pausePackage(pkg)`
  - `restartPackage(pkg)`
  - `canChangeTempoForPackage(pkg)`
  - `setTempoForPackage(pkg, bpm)`
  - `canRepeatMeasureForPackage(pkg)`
  - `setMeasureRepeatEnabledForPackage(pkg, enabled)`
  - `getPlaybackQualityForPackage(pkg)`
  - `getReferenceTempoForPackage(pkg)`
  - `disposePackage(pkg)`

- [ ] **Step 1: Write RED port tests**

Prove:
- package plan is resolved once per immutable `packageId` and cached in-memory;
- FULL/APPROXIMATE quality returned safely;
- unsupported/malformed package -> `canPlayPackage === false`;
- Web Audio unsupported -> false;
- sample bank not successfully initialized -> false;
- teacher permission gates tempo/repeat;
- tempo only accepts 20..300;
- play passes selected current tempo;
- pause/restart delegate only for active matching package;
- package switch disposes old engine domain;
- no raw plan/XML/provider error is returned through port methods.

- [ ] **Step 2: Run RED**

```bash
node --test test/studentPlaybackPort.test.js
```

- [ ] **Step 3: Implement port with explicit package identity**

Do not expose plan caches outside the module. `disposePackage(pkg)` immediately invalidates the engine and removes active package ownership. It may retain immutable validated plan cache for the same package during the app session, but must not retain decoded private XML or create a second persistent store.

- [ ] **Step 4: Run focused/full tests and commit**

```bash
node --test test/studentPlaybackPort.test.js
npm test
git add src/playback/studentPlaybackPort.js test/studentPlaybackPort.test.js
git commit -m "feat: add Student playback port"
```

---

### Task 10: Practice Capability, Controller Lifecycle, and Safe UI Metadata

**Files:**
- Modify: `src/practice/practiceWorkspace.js`
- Modify: `src/ui/studentAppController.js`
- Modify: `src/ui/renderPracticeWorkspace.js`
- Modify: `test/practiceCapabilities.test.js`
- Modify: `test/practiceWorkspace.test.js`
- Modify: `test/studentAppController.test.js`
- Modify: `test/renderStudentApp.test.js`
- Modify: `test/studentAppAccessibilityAcceptance.test.js`
- Modify: `test/studentPlaybackLifecycle.test.js`

**Interfaces:**
- Consumes: Task 9 playback port.
- Produces safe UI-only metadata:
  - `practice.playbackQuality`
  - reference/current `practice.tempoBpm`

- [ ] **Step 1: Add RED workspace tests**

When playback available:
- `playbackQuality === "APPROXIMATE"` projects into view-model;
- invalid/unknown quality becomes `null`;
- reference tempo from port wins when valid;
- safe ephemeral UI state includes `practice.measureRepeatEnabled === false` initially;
- raw plan does not enter view-model.

When playback unavailable:
- quality is `null`.

- [ ] **Step 2: Implement safe projection**

In `createPracticeWorkspace`, after capability derivation:

```js
const playbackQuality =
  capabilities.playback === PRACTICE_CAPABILITY_STATES.AVAILABLE
    ? playbackPort?.getPlaybackQualityForPackage?.(pkg) ?? null
    : null;
```

Normalize quality to FULL/APPROXIMATE only. Tempo source priority:
1. positive finite `playbackPort.getReferenceTempoForPackage(pkg)`;
2. positive finite `pkg.practice.tempoBpm`;
3. `null`.

- [ ] **Step 3: Add RED controller disposal tests**

Prove best-effort `disposePackage` on:
- `showHome`;
- `showPublicPool`;
- `showMyWork`;
- opening a second Practice package;
- `attachSession`;
- `signOut`.

A thrown disposal error must not block navigation/sign-out.

- [ ] **Step 4: Implement controller lifecycle**

Change `clearActivePractice()` to dispose the previous package before nulling it:

```js
function clearActivePractice() {
  const previous = activePracticePackage;
  activePracticeRenderSource = null;
  activePracticePackage = null;

  if (previous !== null) {
    try {
      playbackPort?.disposePackage?.(previous);
    } catch {
      // Playback teardown cannot block authority/navigation transitions.
    }
  }
}
```

When `openPractice` replaces an existing package, clear old playback ownership before assigning the new package.

- [ ] **Step 5: Add RED state-update tests**

Prove:
- successful `setPracticeTempo(60)` updates only safe UI `practice.tempoBpm` after the port succeeds; the immutable package object is unchanged;
- async tempo success updates state after resolution; failure does not overwrite the prior UI tempo;
- successful `setMeasureRepeatEnabled(true)` updates only safe UI `practice.measureRepeatEnabled`;
- repeat failure preserves the previous safe UI repeat state.

Add focused immutable helpers in `practiceWorkspace.js`:

```js
withPracticeTempo(viewModel, bpm)
withPracticeMeasureRepeatEnabled(viewModel, enabled)
```

Both return new frozen view-model snapshots and never mutate `activePracticePackage`.

- [ ] **Step 6: Add RED UI tests**

APPROXIMATE playback renders:
- `<p class="practice-playback-quality">Yaklaşık çalma</p>`;
- Play/Pause/Restart controls;
- teacher-gated tempo/repeat controls.

FULL does not render “Yaklaşık çalma”.

Tempo input:

```html
<input
  id="practice-tempo"
  data-practice-tempo
  type="number"
  min="20"
  max="300"
  step="1"
  inputmode="numeric"
>
```

The repeat checkbox renders `checked` only when `practice.practice.measureRepeatEnabled === true`.

No plan/XML/sample/provider fields may appear.

- [ ] **Step 7: Tighten controller tempo/repeat state handling**

`setPracticeTempo(bpm)` rejects non-finite values and values outside 20..300 before calling the port. On successful sync or async delegation, replace only the safe Practice view-model tempo using `withPracticeTempo`.

`setMeasureRepeatEnabled(enabled)` updates the safe Practice view-model only after successful sync or async delegation using `withPracticeMeasureRepeatEnabled`.

- [ ] **Step 8: Run focused tests**

```bash
node --test   test/practiceCapabilities.test.js   test/practiceWorkspace.test.js   test/studentAppController.test.js   test/renderStudentApp.test.js   test/studentAppAccessibilityAcceptance.test.js   test/studentPlaybackLifecycle.test.js
```

Expected: PASS.

- [ ] **Step 9: Run full suite and commit**

```bash
npm test
git add src/practice/practiceWorkspace.js src/ui/studentAppController.js src/ui/renderPracticeWorkspace.js test/practiceCapabilities.test.js test/practiceWorkspace.test.js test/studentAppController.test.js test/renderStudentApp.test.js test/studentAppAccessibilityAcceptance.test.js test/studentPlaybackLifecycle.test.js
git commit -m "feat: integrate playback capability into Practice"
```

---

### Task 11: Browser Bootstrap, Mount Destroy, and Offline Static Cache

**Files:**
- Modify: `src/ui/main.js`
- Modify: `src/ui/mountStudentApp.js`
- Modify: `service-worker.js`
- Modify: `test/staticShell.test.js`
- Create: `test/playbackOfflineAssets.test.js`
- Modify: `test/studentPlaybackLifecycle.test.js`

**Interfaces:**
- Consumes:
  - Task 4 resolver;
  - Task 6 sample bank;
  - Task 8 engine;
  - Task 9 port.
- Produces default browser runtime injection.

- [ ] **Step 1: Add RED bootstrap tests**

Require `src/ui/main.js` to:
- import/create `createPlaybackPlanResolver`;
- create local piano sample bank with `./vendor/st-piano/runtime-manifest.json`;
- await `sampleBank.initialize()` before constructing the controller, without creating AudioContext;
- create Web Audio engine using `AudioContext || webkitAudioContext`;
- create/inject `playbackPort` into `createStudentAppController`;
- contain no playback CDN URL;
- contain no alphaTab/Tone.js dependency;
- contain no fake timing/canonicalEvents mapping.

- [ ] **Step 2: Implement default browser playback wiring**

Initialize only the lightweight manifest first:

```js
const sampleBank = createPianoSampleBank({
  manifestUrl: "./vendor/st-piano/runtime-manifest.json",
});

await sampleBank.initialize().catch(() => false);
```

Then use lazy audio context creation:

```js
const audioContextFactory = () => {
  const AudioContextCtor =
    globalThis.AudioContext ?? globalThis.webkitAudioContext;

  return typeof AudioContextCtor === "function"
    ? new AudioContextCtor()
    : null;
};
```

Do not create an AudioContext at module startup.

- [ ] **Step 3: Add RED destroy test**

Mount destroy must stop playback even if caller never navigated home first. Add one public controller method:

```js
disposeActivePractice()
```

It only invokes the same best-effort private `clearActivePractice()` path and does not mutate auth/session/navigation state.

`mountStudentApp.destroy()` calls it before final teardown.

- [ ] **Step 4: Implement mount/controller destroy seam**

No playback DOM state or package XML is introduced.

- [ ] **Step 5: Add RED Service Worker tests**

Require cache name bump:

```js
const CACHE_NAME = "st-student-shell-v4";
```

Require:
- all seven required playback modules in `SHELL_ASSETS`: `playbackPlan.js`, `musicXmlPlaybackDom.js`, `musicXmlApproximatePlayback.js`, `playbackPlanResolver.js`, `pianoSampleBank.js`, `webAudioPianoEngine.js`, and `studentPlaybackPort.js`, because the browser module graph imports them;
- a separate `PLAYBACK_STATIC_ASSETS` list containing `vendor/st-piano/runtime-manifest.json`, license/notices, and exactly 12 WAVs;
- `PLAYBACK_ASSET_PATHS` included in fetch handling.

Also assert:
- no `Practice Package`/IndexedDB content path is dynamically added to either static list;
- sample paths are same-origin relative paths;
- no audio CDN URL;
- failure to pre-cache one piano asset does not reject installation of the required Student App shell.

- [ ] **Step 6: Update Service Worker**

Cache required `SHELL_ASSETS` with the existing strict `cache.addAll` path. Then pre-cache each `PLAYBACK_STATIC_ASSETS` item independently in a bounded best-effort loop so one missing piano asset cannot block the Student App shell upgrade. Fetch handling may serve either required shell paths or playback static paths from the same named cache. Preserve existing Firebase best-effort external cache behavior and private-package exclusion.

- [ ] **Step 7: Run focused/full tests and commit**

```bash
node --test test/staticShell.test.js test/playbackOfflineAssets.test.js test/studentPlaybackLifecycle.test.js
npm test
git add src/ui/main.js src/ui/mountStudentApp.js src/ui/studentAppController.js service-worker.js test/staticShell.test.js test/playbackOfflineAssets.test.js test/studentPlaybackLifecycle.test.js
git commit -m "feat: wire offline browser playback runtime"
```

---

### Task 12: Integrated Failure Behavior and Security Regression

**Files:**
- Modify: `test/studentPlaybackPort.test.js`
- Modify: `test/studentAppController.test.js`
- Modify: `test/renderStudentApp.test.js`
- Modify: `test/playbackOfflineAssets.test.js`

**Interfaces:**
- Consumes all previous tasks.
- Produces regression evidence for bounded failure and data minimization.

- [ ] **Step 1: Add integrated RED/green failure cases**

Pin these user-visible outcomes:
- unsupported MusicXML -> playback UNAVAILABLE while notation remains AVAILABLE;
- sample decode failure after admission -> playback ERROR while notation remains AVAILABLE;
- tempo operation failure -> tempoChange ERROR while playback stays AVAILABLE;
- repeat operation failure -> measureRepeat ERROR while playback stays AVAILABLE;
- missing offline sample -> playback-only failure;
- stale sample-load exception text never appears in UI state/HTML;
- MusicXML never appears in playback quality/status text;
- generated plan never appears in controller `getState()`.

- [ ] **Step 2: Run integrated tests**

```bash
node --test   test/studentPlaybackPort.test.js   test/studentAppController.test.js   test/renderStudentApp.test.js   test/playbackOfflineAssets.test.js
```

Expected: PASS.

- [ ] **Step 3: Run complete suite**

```bash
npm test
```

Expected: 0 failures.

- [ ] **Step 4: Inspect diff for authority regressions**

Run:

```bash
git diff --check
git grep -nE 'canonicalEvents.*(start|onset|duration)|https?://.*(wav|mp3|m4a|ogg)|Tone\.js|alphaTab' -- src service-worker.js
```

Expected:
- no canonicalEvents playback inference;
- no external audio URL;
- no Tone.js/alphaTab runtime coupling.

- [ ] **Step 5: Commit**

```bash
git add test
git commit -m "test: harden playback failure isolation"
```

---

### Task 13: Documentation and Exact-Head Automated Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create: `docs/superpowers/progress/2026-09-22-student-07b-hybrid-playback.md`

**Interfaces:**
- Documents exact shipped state and remaining physical gate.

- [ ] **Step 1: Update architecture truth**

Document:
- FULL/APPROXIMATE resolver;
- default APPROXIMATE MusicXML path;
- canonicalEvents exclusion;
- generated same-origin piano bank;
- all-voices-piano decision;
- tempo 20–300;
- current-measure repeat semantics;
- independent notation/playback failure domains;
- Service Worker static cache v4;
- physical acceptance still pending.

- [ ] **Step 2: Update README**

Replace “default build playback UNAVAILABLE” wording with current bounded behavior. Do not claim broad MusicXML compatibility or realistic instrument playback.

- [ ] **Step 3: Create progress ledger**

Record each TDD RED and GREEN commit/run as implementation proceeds. Include:
- test command;
- exact commit SHA;
- pass/fail counts;
- deviations/rulings.

- [ ] **Step 4: Fresh full verification**

Run:

```bash
npm ci
npm test
node scripts/generate-st-piano-bank.mjs
git diff --exit-code -- vendor/st-piano
git diff --check
```

Expected:
- install succeeds;
- all tests pass;
- generator is deterministic;
- no diff after regeneration;
- no whitespace errors.

- [ ] **Step 5: Push feature branch and require exact-head CI**

Execution branch:

```text
feat/student-07b-hybrid-playback
```

It must be created from the approved spec/plan branch head so the PR contains the spec, plan, and code.

Do not merge.

- [ ] **Step 6: Run Codex Engineering Guardrails independent verification**

Use `skills://plugins/codex-engineering-guardrails/code-verification` read-only against the complete branch. Review:
- spec/plan compliance;
- parser/timing safety;
- audio lifecycle/race behavior;
- authority/data-minimization boundaries;
- offline asset completeness;
- licensing/provenance of generated audio;
- exact-head CI evidence.

Any material defect gets one bounded TDD fix pass, followed by fresh whole-branch verification.

- [ ] **Step 7: Commit docs if verification adds only evidence**

```bash
git add README.md docs/architecture.md docs/superpowers/progress/2026-09-22-student-07b-hybrid-playback.md
git commit -m "docs: record STUDENT-07B automated verification"
```

Then require CI green again on the new exact head.

---

### Task 14: Physical iPhone/Safari/VoiceOver Acceptance and Merge Gate

**Files:**
- Modify after test: `docs/superpowers/progress/2026-09-22-student-07b-hybrid-playback.md`
- Optional temporary branch-only workflow: `.github/workflows/pages-preview.yml` — only with explicit preview authorization; remove before merge.

**Interfaces:**
- Final user/device acceptance only.
- No product behavior should be changed in this task unless a test exposes a defect.

- [ ] **Step 1: Obtain explicit authorization for temporary HTTPS preview**

Do not change Pages/environment policy or deploy without user approval.

- [ ] **Step 2: Verify deployed content is exact feature HEAD**

Before device testing, fetch:
- `src/ui/main.js`;
- `vendor/st-piano/runtime-manifest.json`;
- one WAV;
- current commit marker if the preview workflow emits one.

Do not test an old Pages branch accidentally.

- [ ] **Step 3: Run physical acceptance**

On the user's iPhone Safari:

1. Open authorized Practice; notation remains correct.
2. Tap **Dinle**; audible piano starts only after the tap.
3. Tap **Duraklat**; audio stops.
4. Tap **Dinle**; resumes from paused musical position.
5. Tap **Baştan**; restarts at score start when repeat is off.
6. Set tempo to a visibly different value within 20–300; speed changes while pitch remains stable.
7. Enable **Ölçü tekrarını aç** during a later measure; that captured measure loops.
8. Disable repeat; playback exits loop at the next boundary.
9. Confirm **Yaklaşık çalma** appears for the default MusicXML route.
10. Rotate portrait/landscape; no duplicate audio engine or restart.
11. Go Home; audio stops immediately.
12. Reopen Practice; playback starts only on a new explicit tap.
13. Sign out during playback; audio stops immediately.
14. Reopen/cache online, then disable Wi-Fi/cellular and reload; cached Practice can play piano offline.
15. VoiceOver reaches Dinle, Duraklat, Baştan, tempo and repeat controls when teacher permissions expose them.
16. No raw XML/runtime/provider text is announced.

- [ ] **Step 4: Record evidence**

Mark each item PASS/FAIL in the progress document. A skipped or unverified item is not PASS.

- [ ] **Step 5: Remove temporary preview infrastructure**

Before merge:
- remove branch-only preview workflow from final diff;
- remove only the temporary STUDENT-07B Pages branch policy;
- do not alter `main` or historical STUDENT-06 policy unless separately authorized.

- [ ] **Step 6: Run fresh exact-head CI after cleanup**

```bash
npm test
git diff --check
```

Require GitHub CI SUCCESS for that exact commit.

- [ ] **Step 7: STOP before merge**

Report:
- exact feature head SHA;
- exact CI run and pass/fail count;
- physical acceptance table;
- independent code-verification result;
- remaining known limitations.

PR must remain unmerged until the user explicitly says to merge it.
