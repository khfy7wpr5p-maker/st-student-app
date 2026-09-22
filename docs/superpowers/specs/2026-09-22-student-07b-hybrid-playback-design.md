# STUDENT-07B — Hybrid Playback Runtime Design

Date: 2026-09-22  
Repository: `khfy7wpr5p-maker/st-student-app`  
Base: `main@9e698fccdca95d042be07fbc1e4d6aeb3dbb939a`

## 1. Goal

STUDENT-07B adds a Student App-owned browser playback subsystem for authorized Practice Packages.

The subsystem must let a student:

- play;
- pause;
- restart;
- change tempo when the teacher allowed `allowTempoChange`;
- repeat the current measure when the teacher allowed `allowMeasureRepeat`;
- keep playback available offline after the required static assets and Practice Package have already been cached.

The first production sound is deliberately simple: every playable pitched note uses the same piano sound family. Instrument-specific timbres are not part of STUDENT-07B.

Playback remains independent from notation. A playback failure must never hide, block, replace, or downgrade a working notation presentation.

## 2. Approved product decision

Playback uses a hybrid authority model.

1. If an injected trusted timing provider can return a validated trusted playback plan for the exact immutable package, that plan is used with quality `FULL`.
2. Otherwise Student App may compile the package MusicXML into a bounded playback plan with quality `APPROXIMATE`.
3. Unknown `content.canonicalEvents` objects are never interpreted as timing authority in STUDENT-07B.
4. If neither a trusted plan nor a safe approximate plan can be produced, playback remains `UNAVAILABLE`.
5. A runtime/audio failure changes only playback-related capabilities to `ERROR`; notation remains independent.

`FULL` is therefore a provenance claim, not a claim that the browser synthesizer sounds like the original instrument.

## 3. Existing contracts preserved

The existing Practice Workspace playback port remains the product-facing boundary:

- `canPlayPackage(pkg)`
- `playPackage(pkg)`
- `pausePackage(pkg)`
- `restartPackage(pkg)`
- `canChangeTempoForPackage(pkg)`
- `setTempoForPackage(pkg, bpm)`
- `canRepeatMeasureForPackage(pkg)`
- `setMeasureRepeatEnabledForPackage(pkg, enabled)`

STUDENT-07B adds only the lifecycle/metadata methods required by the browser implementation:

- `getPlaybackQualityForPackage(pkg)` -> `"FULL" | "APPROXIMATE" | null`
- `getReferenceTempoForPackage(pkg)` -> positive finite BPM or `null`
- `disposePackage(pkg)` -> synchronous best-effort stop/invalidation

No publish, revoke, edit, delete, Teacher App write, or Sharing Layer management capability is added.

Practice Package v1 schema is not changed by STUDENT-07B.

## 4. Architecture

```text
Authorized Practice Package
          |
          v
  PlaybackPlanResolver
     |            |
     |            +--> MusicXML Approximate Compiler
     |                       |
     |                       +--> APPROXIMATE PlaybackPlan
     |
     +--> TrustedTimingProvider
                 |
                 +--> FULL PlaybackPlan
          |
          v
   PlaybackPlan Validator
          |
          v
 StudentPlaybackPort
          |
          v
 WebAudioPianoEngine
          |
          v
Play / Pause / Restart
Tempo / Current-measure repeat
```

The Rendering Layer remains presentation-only. STUDENT-07B does not modify ST Score Rendering Layer and does not use OSMD as a playback authority.

alphaTab is not a STUDENT-07B runtime dependency. Existing repository evidence in the wider SesliTab work does not establish alphaTab synthesizer production readiness, so Student App does not couple its playback availability to alphaTab.

## 5. Internal PlaybackPlan contract

PlaybackPlan is private Student App runtime data. It is never written into Student UI state, HTML, Firestore, or IndexedDB as a second canonical music source.

A normalized plan contains:

```js
{
  schemaVersion: 1,
  quality: "FULL" | "APPROXIMATE",
  packageId: string,
  referenceTempoBpm: number,
  tempoMap: [
    { beat: number, bpm: number }
  ],
  measures: [
    { index: number, startBeat: number, endBeat: number }
  ],
  notes: [
    {
      startBeat: number,
      durationBeats: number,
      midi: number,
      measureIndex: number,
      partId: string,
      voice: string | null
    }
  ]
}
```

Validation requirements:

- all numbers are finite;
- `startBeat >= 0`;
- `durationBeats > 0`;
- tempo-map beats are non-decreasing;
- tempo values are `> 0` and `<= 1000`;
- measure ranges are finite, ordered, non-overlapping and positive length;
- note MIDI values are integers in `0..127`;
- note events are ordered deterministically;
- package identity must exactly match the immutable package being played;
- maximum note-event count is 100,000;
- maximum measure count is 10,000;
- at least one playable note must remain.

A trusted timing provider returning an invalid plan is treated as a provider failure. The resolver does not silently relabel that invalid trusted output as approximate. Approximate fallback occurs only when the trusted provider explicitly reports that it has no trusted plan for the package.

## 6. Trusted timing provider

The default Student App build has no trusted timing provider, so current Practice Package v1 content normally resolves through the approximate path.

The optional provider contract is synchronous and side-effect-free:

```js
trustedTimingProvider.resolveTrustedPlan(pkg)
```

It returns either:

- a complete PlaybackPlan whose quality is `FULL`; or
- `null` to state that no trusted timing plan exists.

It must not fetch remote timing data during capability discovery. Future packages or trusted adapters may implement this port without changing the Student App playback engine.

STUDENT-07B does not create the upstream producer for FULL timing data.

## 7. Approximate MusicXML compiler

The approximate compiler reads only:

`pkg.content.score.format === "musicxml"` and `pkg.content.score.data`.

It never derives timing from `content.canonicalEvents`.

### 7.1 Supported root and safety

The first implementation accepts `score-partwise` MusicXML.

It must:

- use the browser XML parser through a narrow injected parser seam so deterministic Node tests can supply fixtures;
- reject parser errors;
- respect the existing bounded MusicXML source size;
- perform no network fetches;
- never execute script or active content;
- stop with `UNAVAILABLE` rather than guessing when the supported structural subset cannot produce a safe plan.

`score-timewise` is not compiled in STUDENT-07B. Notation may still render it independently if the renderer supports it.

### 7.2 Timing model

Each part is compiled measure by measure in MusicXML divisions.

The compiler supports:

- `divisions`;
- pitched `note`;
- `rest`;
- `duration`;
- `voice`;
- `chord`;
- `backup`;
- `forward`;
- duration encoded tuplets because the MusicXML `duration` value already expresses their performed length in divisions;
- tie start/stop merging for the same sounding pitch/part/voice;
- part transposition through `transpose/chromatic` and `transpose/octave-change`;
- numeric `sound tempo` tempo changes;
- package `practice.tempoBpm` as the preferred initial/reference tempo when it is a positive finite value.

Per-measure events from different parts share one global measure start. The global duration of a measure is the maximum compiled duration for that measure across parts. This preserves cross-part alignment without inventing missing notes.

A chord note begins at the onset of the immediately preceding non-chord note in its voice context and does not advance the time cursor.

`backup` and `forward` move the local measure cursor by their explicit duration only. Negative cursor movement or cursor overflow beyond bounded finite values fails the approximate plan rather than being silently corrected.

### 7.3 Tempo

The plan preserves supported numeric `sound tempo` changes as a tempo map.

Initial tempo priority is:

1. positive finite `pkg.practice.tempoBpm`;
2. first supported MusicXML numeric tempo;
3. 120 BPM.

If package tempo overrides the score's initial tempo, it defines the plan reference tempo and scales the supported score tempo map proportionally. This allows the UI tempo control to change overall speed while preserving relative tempo changes.

The Student tempo control is bounded to 20–300 BPM. Values outside that range are rejected rather than clamped.

### 7.4 Intentionally unsupported approximate semantics

The compiler does not claim exact playback for:

- ornaments;
- grace-note timing without explicit supported duration;
- swing/humanization;
- dynamics/articulation shaping;
- MIDI program/instrument changes;
- unpitched percussion;
- score-level repeats, voltas, D.C., D.S., coda and navigation jumps;
- pedal/sustain controller semantics;
- microtonal pitch beyond integer MIDI semitone resolution;
- arbitrary vendor extensions.

Unsupported metadata is not converted into invented timing. Supported pitched material may still produce an `APPROXIMATE` plan when these features are present. If no playable pitched notes remain, playback is `UNAVAILABLE`.

## 8. Piano sound model

All playable notes use one same-origin piano sample bank.

The bank design is fixed for STUDENT-07B:

- 12 chromatic reference samples: C4 through B4;
- each target MIDI note chooses the sample with the same pitch class;
- octave displacement is produced with an exact power-of-two `playbackRate`;
- no instrument-specific sample switching;
- decoded buffers are reused for the app session;
- one bounded gain envelope prevents clicks and releases notes at their scheduled end.

The implementation must select one sample source before production-code integration. The selected source must:

- permit commercial redistribution in the Student App;
- permit offline bundling;
- have license/provenance text committed next to the assets;
- have a manifest containing byte lengths and SHA-256 hashes;
- use a Safari-compatible browser audio format;
- keep the complete 12-sample bank at or below 8 MiB.

If no candidate satisfies every requirement, asset integration stops rather than shipping an unclear license or network dependency.

No sample is loaded from a CDN at playback time.

## 9. Web Audio engine

The default engine uses the browser Web Audio API.

### 9.1 User gesture

The `AudioContext` is created or resumed only from the student's explicit playback action. This preserves iOS/Safari autoplay requirements.

### 9.2 Scheduling

The engine uses a bounded look-ahead scheduler rather than scheduling an entire score at once.

Requirements:

- only one active Practice Package may sound at a time;
- future notes are scheduled in a short bounded window;
- pause stops active/scheduled sources and stores the current musical beat;
- resume continues from the stored beat;
- restart returns to the start of the current playback domain;
- package disposal stops all sources immediately and invalidates pending asynchronous sample loading;
- stale async completion after package switch/sign-out must never start audio.

The engine converts beats to seconds from the validated tempo map. UI tempo changes apply a global scale relative to the plan reference tempo.

### 9.3 Restart semantics

When measure repeat is off, `restartPackage` restarts at score beat 0.

When measure repeat is on, `restartPackage` restarts at the captured repeat measure start.

## 10. Measure repeat semantics

STUDENT-07B does not add a measure-number picker.

When `setMeasureRepeatEnabledForPackage(pkg, true)` is called:

- if playback is active or paused after progress, the engine captures the measure containing the current playhead;
- if playback has not advanced, measure 1 is captured;
- the scheduler loops from that measure's `startBeat` to `endBeat`;
- disabling repeat lets playback continue beyond the current measure on the next boundary;
- package switch/reopen clears the previous package's repeat capture.

This definition matches the current single checkbox UI and avoids creating a new editing/navigation surface.

## 11. Playback metadata in safe UI state

The Practice view-model may expose only:

- `playbackQuality: "FULL" | "APPROXIMATE" | null`;
- a positive finite `tempoBpm`.

No PlaybackPlan events, MusicXML, sample paths, provider errors, omitted-event counts, or package internals enter Student HTML.

When playback quality is `APPROXIMATE`, the Dinleme section shows one compact accessible label:

`Yaklaşık çalma`

`FULL` playback does not add an extra confidence claim beyond normal Dinleme availability.

The existing Play/Pause/Restart controls remain:

- `Dinle`
- `Duraklat`
- `Baştan`

Tempo and measure-repeat controls remain visible only when their existing capability gates are `AVAILABLE`.

## 12. Capability behavior

`canPlayPackage(pkg)` returns true only when:

- Web Audio is supported;
- a validated FULL or APPROXIMATE plan exists;
- the piano sample-bank configuration is installable/available as a trusted same-origin static runtime;
- the plan contains at least one playable note.

`canChangeTempoForPackage(pkg)` additionally requires `pkg.practice.allowTempoChange === true`.

`canRepeatMeasureForPackage(pkg)` additionally requires:

- `pkg.practice.allowMeasureRepeat === true`;
- at least one validated measure range.

A sample decode/load error during playback changes only playback to `ERROR`. A tempo-operation failure changes only tempoChange to `ERROR`. A repeat-operation failure changes only measureRepeat to `ERROR`. Notation remains unchanged.

## 13. Lifecycle integration

The controller already keeps the authorized package private. STUDENT-07B keeps that rule.

Before clearing or replacing an active Practice Package, the controller calls `playbackPort.disposePackage(activePracticePackage)` best-effort.

This applies to:

- Home navigation;
- Public Pool navigation;
- My Work navigation;
- package switch;
- sign-out;
- session/account switch.

The operation must be synchronous from the controller's perspective and must immediately prevent stale async audio from starting.

The Student App mount destroy path also stops the active playback runtime through the controller/port lifecycle boundary.

## 14. Offline behavior

Playback code and piano samples are static application assets.

Service Worker requirements:

- advance the static shell cache version;
- explicitly cache the playback modules;
- explicitly cache the piano sample manifest/license files;
- explicitly cache all 12 piano samples;
- never put private Practice Packages in Cache Storage;
- continue using IndexedDB as the only canonical private Practice Package offline store.

After one successful online install/cache plus authorized Practice cache, the same Practice must support approximate playback offline without a playback-network request.

FULL playback is offline only when its trusted plan is already derivable from the locally cached authorized package/provider context.

## 15. Failure behavior

Fail closed at the playback boundary, not at the Practice Workspace boundary.

Examples:

- malformed/unsupported MusicXML -> playback `UNAVAILABLE`; notation unchanged;
- invalid trusted plan -> playback `UNAVAILABLE` or operation `ERROR`, never silently relabeled FULL/APPROXIMATE;
- no Web Audio -> playback `UNAVAILABLE`;
- sample asset missing before capability admission -> playback `UNAVAILABLE`;
- sample decoding fails after admission -> playback `ERROR`;
- playback runtime exception -> bounded Student message only;
- package switch during sample load -> stale load is ignored and cannot sound;
- offline sample cache miss -> playback unavailable/error only, cached notation/work remains usable.

Raw XML, exception messages and internal provider/asset details are never displayed to the student.

## 16. Security and authority invariants

STUDENT-07B must preserve all existing authority boundaries:

- only an already authorized Practice Package reaches the playback port;
- Student App cannot publish, revoke or approve;
- Student App cannot mutate teacher-approved source data;
- playback compilation never upgrades APPROXIMATE evidence into canonical music truth;
- unknown canonicalEvents are ignored for timing;
- sample assets are static public application assets, not student data;
- private package data remains IndexedDB-owned;
- no service-account/admin credential is added;
- no live Firestore write is added;
- no analytics, recording, microphone, MIDI input/output, background audio entitlement or notification feature is added.

## 17. Expected code boundaries

Expected new modules:

- `src/playback/playbackPlan.js`
- `src/playback/playbackPlanResolver.js`
- `src/playback/musicXmlApproximatePlayback.js`
- `src/playback/pianoSampleBank.js`
- `src/playback/webAudioPianoEngine.js`
- `src/playback/studentPlaybackPort.js`

Expected integrations:

- `src/ui/main.js` — construct/inject the default Student playback port;
- `src/practice/practiceWorkspace.js` — safe playback quality/reference-tempo projection;
- `src/ui/studentAppController.js` — package playback lifecycle disposal;
- `src/ui/renderPracticeWorkspace.js` — compact APPROXIMATE label and bounded tempo input;
- `src/ui/mountStudentApp.js` — mount-destroy playback teardown if required by the final controller seam;
- `service-worker.js` — static playback/sample asset caching;
- `README.md` and `docs/architecture.md` — current production truth.

Expected static assets:

- `vendor/st-piano/runtime-manifest.json`;
- `vendor/st-piano/THIRD_PARTY_NOTICES.md`;
- one committed license/provenance file;
- 12 same-origin piano audio files.

No modification is expected in:

- ST Score Rendering Layer;
- Teacher App;
- Firestore Security Rules;
- Practice Package v1 schema;
- Sharing Layer management API.

Any need to change one of those boundaries is a design escalation and must stop for separate human approval.

## 18. Verification strategy

Implementation follows TDD.

### 18.1 PlaybackPlan validation

Tests cover:

- valid FULL and APPROXIMATE plans;
- package mismatch;
- invalid/non-finite numbers;
- ordering;
- invalid measures;
- invalid MIDI;
- event/measure bounds;
- zero playable notes.

### 18.2 Approximate MusicXML compiler

Fixtures cover:

- monophonic notes/rests;
- chords;
- polyphony using backup/forward;
- divisions changes;
- ties;
- tuplets represented by duration/divisions;
- multi-part measure alignment;
- chromatic and octave transposition;
- numeric tempo changes;
- teacher practice tempo scaling;
- malformed XML;
- unsupported score-timewise;
- percussion-only score;
- event-limit failure;
- deterministic output.

### 18.3 Resolver

Tests prove:

- valid trusted plan wins and remains FULL;
- explicit trusted `null` falls back to APPROXIMATE;
- invalid trusted plan fails closed and does not silently fall back;
- canonicalEvents do not enable playback.

### 18.4 Piano sample bank

Tests verify:

- exactly 12 pitch-class references;
- manifest byte length/SHA-256 integrity;
- commercial redistribution license/provenance file is present;
- total asset bytes <= 8 MiB;
- deterministic MIDI-to-reference-sample and octave-rate mapping;
- no CDN/runtime network URL is embedded.

### 18.5 Web Audio scheduler

With an injected fake audio clock/context, tests cover:

- play;
- pause/resume;
- restart;
- tempo change during playback;
- tempo-map conversion;
- current-measure repeat;
- disable repeat;
- one-package-at-a-time isolation;
- dispose while loading;
- stale-generation suppression;
- source cleanup.

### 18.6 Existing Student App contracts

Tests prove:

- playback availability is independent from notation;
- playback ERROR does not change notation;
- tempo ERROR does not change playback;
- repeat ERROR does not change playback;
- APPROXIMATE label contains no raw package/XML/provider detail;
- navigation/package switch/sign-out disposes playback;
- private package remains absent from generic UI state;
- Service Worker caches static playback assets but not Practice Packages;
- full repository suite remains green.

## 19. Physical iPhone / Safari acceptance

A temporary HTTPS preview may be used, under the same bounded deployment discipline used for STUDENT-07A.

Acceptance requires:

1. authorized Practice opens with notation unchanged;
2. Dinle starts audible piano playback after the explicit tap;
3. Duraklat stops sound and Dinle resumes from the paused musical position;
4. Baştan restarts from the defined playback-domain start;
5. tempo change audibly changes speed without changing pitch;
6. measure repeat loops the current measure and disabling it exits the loop;
7. APPROXIMATE packages expose the compact `Yaklaşık çalma` label;
8. rotating the phone does not interrupt/duplicate the playback engine;
9. leaving Practice stops audio;
10. sign-out stops audio;
11. after online asset/package caching, Safari reload with network disabled can reopen the cached Practice and play it;
12. VoiceOver can reach Dinle, Duraklat, Baştan, tempo and repeat controls with understandable labels;
13. no raw XML/runtime/provider text is announced.

Merge remains blocked until automated exact-head CI and this physical acceptance pass.

## 20. Explicit non-goals

STUDENT-07B does not add:

- instrument-specific sound selection;
- realistic orchestral mixing;
- score-following;
- notation cursor synchronization;
- recording or microphone input;
- MIDI input/output;
- background playback;
- per-part mute/solo/volume;
- a measure-number picker;
- MusicXML editing;
- Teacher App changes;
- a new canonical timing schema;
- a producer for FULL timing plans;
- alphaTab/OSMD playback authority;
- score-repeat/volta/D.C./D.S. execution in the approximate compiler.

These can be separate bounded or architectural stages after STUDENT-07B is proven on the physical Student App.
