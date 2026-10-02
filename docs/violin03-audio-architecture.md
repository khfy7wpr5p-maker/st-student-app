# VIOLIN-03 Student Violin Audio Architecture

Document refresh: 2026-10-03  
Status: Audio Engine phase complete; Student integration not started  
Primary Student baseline: `b59bcb6dc5525f035515ab358734ebbe5a277fbb`  
Pinned Audio Engine runtime export source: `298ddd61ba3854231ff7e59a88c22c4a01530a41`  
Audio contract/runtime: `0.2.0`

## 1. Purpose

VIOLIN-03 adds qualified violin sound to Student playback without introducing a second musical transport.

For a supported simple first-position violin exercise, the same Student-owned playback generation must keep these outputs synchronized:

1. score highlight;
2. first-position violin fingering;
3. target-part violin audio;
4. non-target accompaniment through the existing piano lane.

The Student App remains the sole authority for beats, tempo, repeat/range state, pause/restart, schedule-ahead behavior, package identity, source provenance, and transport generation.

## 2. Preserved authority boundaries

### Student App owns

- Practice Package identity and source revision;
- trusted/approximate PlaybackPlan resolution;
- beat/tempo conversion;
- schedule-ahead window;
- current playback generation;
- pause/restart/tempo/repeat/range semantics;
- explicit `content.violin.targetPartId`;
- target vs non-target routing;
- exact source-event evidence used to authorize the violin lane.

### `st-violin-learning-engine` owns

- first-position violin fingering semantics;
- string/finger/physical fingerboard position results;
- supported/ambiguous/unavailable fingering state.

It does not own transport or audio scheduling.

### `st-score-audio-engine` owns

- qualified VIOLIN sample manifest and provenance;
- sample resolution/decode;
- `preparePitches()`;
- absolute AudioContext-time `scheduleNote()`;
- bounded voices/release/note-off;
- explicit audio capability/error results.

It does not own beats, tempo, repeat, package state, score semantics, or renderer state.

### Renderer owns

Presentation and hit-test only. Renderer DOM/SVG geometry is never violin pitch authority.

## 3. Current verified baseline

The current Student composition creates `audioContextFactory` in `src/ui/main.js`. That factory creates a new context on each call.

The existing `createWebAudioPianoEngine()` already owns the transport scheduler mechanics:

- `beatToSeconds()` / `secondsToBeat()`;
- `beatWhen()` absolute start calculation;
- 50 ms lookahead interval;
- 250 ms schedule-ahead horizon;
- transport generation invalidation;
- pause/restart;
- tempo re-anchor;
- measure repeat;
- measure-range playback;
- position snapshots for score/fingering followers.

VIOLIN-03 must extend this scheduler instead of creating another interval, another beat clock, or another transport.

Current Service Worker cache baseline is `st-student-shell-v18`.

## 4. Shared AudioContext session

Student introduces one audio-session boundary:

```text
StudentAudioSession
  -> lazy/memoized AudioContext
  -> same audioContextFactory()
       -> WebAudioPianoEngine
       -> ST Score Audio Engine
```

Rules:

- zero contexts are created before audio is needed;
- the first allowed playback/user-gesture path creates or resumes the context;
- every consumer in the active Student audio session receives the exact same object identity;
- ordinary pause/resume does not replace the context;
- full session dispose may close it and permit a later session to create a new one;
- unsupported browsers degrade playback capability without breaking notation/fingering.

This rule follows Web Audio scheduling semantics: `AudioContext.currentTime` is the context-local audio timeline and `AudioBufferSourceNode.start(when)` uses the same time coordinate system.

## 5. Pinned runtime loader

Student vendors the exact deterministic Task 3 Audio Engine export under:

`vendor/st-score-audio/`

Required payload:

- `runtime-manifest.json`;
- `st-score-audio-engine.js`;
- CC0/provenance notice;
- exact 15 approved violin WAV roots.

The loader must:

- accept same-origin vendored paths only;
- verify runtime `0.2.0`;
- verify public contract `0.2.0`;
- verify the exact approved source/export revision;
- reject a missing, duplicate, stale, or mismatched global;
- be single-flight;
- never fall back to a floating remote runtime.

No violin routing is activated in Task 4. Task 4 proves only shared context ownership and trusted runtime loading.

## 6. Exact target-part schedule

Student builds the violin target schedule before playback routing is considered ready.

The schedule is derived from:

- PlaybackPlan timing/duration;
- existing exact ScoreFollow source-event evidence;
- explicit `targetPartId`;
- package/source identity.

Each target event carries at minimum:

- source event id;
- part id;
- start beat;
- duration beats;
- canonical sounding MIDI;
- measure index;
- voice.

Fail closed and return no violin schedule when:

- source mapping is not exact;
- target event mapping is missing/duplicated/contradictory;
- target PlaybackPlan MIDI disagrees with exact source evidence;
- target part has non-zero MusicXML transposition under V1;
- target part is simultaneously/overlapping polyphonic under V1;
- package/source evidence is stale.

The position subscription remains presentation-only. It is not a note-on trigger.

## 7. Violin audio lane state machine

The violin lane is independently degradable.

Before playback starts:

- if exact schedule + runtime + context + `preparePitches()` are all ready, target routing may become external;
- otherwise the normal piano path remains intact.

After external routing has started:

- a violin scheduling failure stops/fails the violin lane for the current generation;
- later target notes are suppressed for that generation;
- Student does not switch mid-note or mid-generation back to piano;
- non-target piano continues;
- transport, notation, highlight, and fingering continue.

A later restart/new generation may re-evaluate readiness.

## 8. One scheduler, two lanes

`webAudioPianoEngine` remains the sole scheduler.

Its routing seam receives the already-computed values:

- note;
- absolute `startTimeSeconds = beatWhen(startBeat)`;
- duration seconds;
- transport generation.

Routing outcomes:

- `PIANO`: existing piano source behavior;
- `EXTERNAL`: do not create piano source; schedule target note through the violin lane at the exact same absolute time;
- `SUPPRESS`: create neither piano nor external fallback.

The target part is never intentionally scheduled in both lanes.

No second interval, no callback-driven position note-on loop, and no Audio Engine-owned transport are permitted.

## 9. Lifecycle behavior

### Pause

- preserve current Student beat according to existing behavior;
- invalidate/stop pending and active violin voices for the generation;
- keep notation/highlight/fingering lifecycle unchanged.

### Restart

- stop old target voices;
- use Student's canonical restart beat;
- create a new scheduling generation;
- rebuild/re-evaluate violin readiness.

### Tempo change

- capture current beat;
- invalidate old scheduled voices;
- re-anchor through the existing Student tempo calculation;
- recompute future absolute violin times.

### Measure repeat / play-measure-once

Use the same existing Student beat range. There is no independent violin loop.

### Package switch / unbind / dispose

Pending async work becomes stale and cannot re-enable or sound the old lane.

## 10. Offline/static delivery

The integration remains static/offline-first and adds no Render service.

Task 8 advances the Service Worker cache exactly once from `st-student-shell-v18` to `st-student-shell-v19`.

Only the pinned static Audio Engine runtime/provenance/15 WAV files are added to the playback asset allowlist.

Private Practice Package and MusicXML payloads remain outside Cache Storage.

Required warm-cache behavior:

- no network request is required for the pinned violin runtime/sample assets;
- missing/corrupt audio assets disable only the violin lane;
- notation/highlight/fingering remain available where their own prerequisites are satisfied.

## 11. Accessibility and UI

VIOLIN-03 adds no new visible playback mode or control.

Existing Student controls remain authoritative.

Audio success is never required for the accessible notation/fingering experience. Capability status must not steal focus or announce repeatedly on every position update.

Physical VoiceOver behavior is part of the final iPhone qualification gate.

## 12. Security and provenance

- runtime and sample assets are same-origin and version/revision pinned;
- no floating remote runtime is trusted;
- manifest byte count/SHA-256 evidence must match the approved Audio Engine export;
- no credentials, private Practice Package data, or student-specific payloads enter static audio cache;
- stale package/source/generation evidence fails closed before external scheduling.

## 13. Dependency-ordered continuation

Completed upstream:

1. Audio Contract `0.2.0` — complete.
2. Audio Engine `preparePitches()` + `scheduleNote()` — complete.
3. Deterministic Student runtime/sample export — complete.

Student continuation:

4. Shared AudioContext session + pinned runtime loader.
5. Exact target-part violin schedule.
6. Fail-closed violin audio lane.
7. One scheduler routing piano + violin.
8. Offline pinned runtime/sample cache (`v19`).
9. Chromium/WebKit integration qualification: highlight + fingering + violin audio.
10. Cross-repository CI + physical iPhone/Safari/offline/VoiceOver human gate.

## 14. Merge and deployment gates

The Student implementation must stop after Task 10 evidence is collected.

Required before merge:

- full Student tests GREEN;
- browser tests GREEN;
- exact pins/integrity verified;
- Audio Engine upstream remains green at the approved pin;
- physical iPhone/Safari acceptance recorded;
- offline warm-cache acceptance recorded;
- blockers explicitly listed.

Merge requires explicit human approval. Deploy requires a later, separate explicit approval. No new Render service or URL may be created.

## 15. External reference checked through Context7

Current MDN Web Audio documentation confirms:

- `BaseAudioContext.currentTime` is the context's own audio timeline in seconds;
- it stops advancing while the context is suspended;
- `AudioBufferSourceNode.start(when)` uses the same AudioContext time coordinate system;
- creating/resuming Web Audio from a user interaction is the expected autoplay-safe lifecycle.

Reference sources:
- https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime
- https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices

These facts reinforce the approved single-context/single-scheduler architecture; they do not transfer musical transport authority to the Audio Engine.
