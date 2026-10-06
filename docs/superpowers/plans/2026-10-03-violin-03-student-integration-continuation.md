# VIOLIN-03 Student Integration Continuation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task. If no registered subagent environment exists, use `superpowers:executing-plans` inline without weakening RED→GREEN or review gates.

**Goal:** Complete Student-side violin audio integration so one Student-owned transport synchronizes score highlight, first-position fingering, target-part violin audio, and non-target piano accompaniment without double sound or a second scheduler.

**Architecture:** Student owns one memoized AudioContext session and the existing `webAudioPianoEngine` remains the sole beat→seconds scheduler. The pinned ST Score Audio Engine runtime is a transportless external voice lane that consumes exact target events and absolute AudioContext times; failures are isolated and fail closed.

**Tech Stack:** Vanilla ESM, Node `node:test`, Playwright Chromium/WebKit, Web Audio API, static Service Worker cache, vendored/pinned ST browser runtimes.

**Spec:** `docs/violin03-audio-architecture.md`

## Checkpoint pins

- Student baseline: `b59bcb6dc5525f035515ab358734ebbe5a277fbb`.
- Audio Engine implementation/export pin: `298ddd61ba3854231ff7e59a88c22c4a01530a41`.
- Audio Engine contract/runtime: `0.2.0`.
- Audio Engine pre-documentation CI: `37067904213` SUCCESS.
- Audio Engine export verification: `37067898943` SUCCESS.
- Audio Engine PR #16 remains draft/unmerged.
- Student Service Worker baseline: `st-student-shell-v18`.
- Student Tasks 4–10 are not started at this checkpoint.

## Global constraints

- Student remains the only beat/tempo/repeat/transport authority.
- Do not create a second scheduling interval for violin.
- Piano and violin lanes must share one exact AudioContext object identity.
- Renderer DOM/SVG is never pitch authority.
- `content.violin.targetPartId` must be explicit.
- Target-part non-zero MusicXML transposition fails closed in V1.
- Target-part simultaneous/overlapping polyphony fails closed in V1.
- Position callbacks drive presentation only; they never trigger violin note-on.
- Audio failure must not break notation, score highlight, fingering, package state, or transport.
- Non-violin packages must remain behaviorally unchanged.
- No new Render service or URL.
- No merge, deploy, release, or production cutover without separate human approval.
- Use TDD for each behavior slice and record fresh verification evidence.

## Review focus

1. **Context identity:** two AudioContexts in one active session are a contract failure.
2. **Late readiness:** violin not fully prepared before play means keep the target on normal piano; never partially externalize the target.
3. **Post-start failure:** once externally routed, failure suppresses later target notes for that generation; no mid-generation piano fallback.
4. **Stale work:** package/source/generation changes must invalidate pending async runtime/sample work before it can sound.
5. **Offline privacy:** only static audio assets enter Cache Storage; Practice Package/MusicXML/private assignment data never does.

---

### Task 4: Shared AudioContext Session + Pinned Runtime Loader

**Files**
- Create: `src/playback/studentAudioSession.js`
- Create: `src/playback/scoreAudioRuntimeLoader.js`
- Create: `test/studentAudioSession.test.js`
- Create: `test/scoreAudioRuntimeLoader.test.js`
- Modify: `src/ui/main.js`
- Modify: `test/staticShell.test.js`
- Vendor exact Task 3 export under: `vendor/st-score-audio/`

**Interfaces**
- `createStudentAudioSession({ AudioContextCtor })`
  - `isSupported()`
  - `audioContextFactory()`
  - `getContext()`
  - `dispose()`
- `createScoreAudioRuntimeLoader(config).load()` returns the pinned runtime API or `null`.

- [ ] Write RED tests for lazy creation, stable object identity, one close on dispose, unsupported browser degradation.
- [ ] Write RED loader tests for exact source/runtime/contract pins, same-origin-only loading, missing/mismatched global rejection, single-flight behavior.
- [ ] Run `node --test test/studentAudioSession.test.js test/scoreAudioRuntimeLoader.test.js test/staticShell.test.js` and confirm intended failures.
- [ ] Implement the smallest session + loader seam. Replace `main.js` non-memoized factory only; do not activate violin routing yet.
- [ ] Re-run focused tests GREEN and `git diff --check`.
- [ ] Commit `feat: add shared student audio session`.

**Acceptance**
- Piano and future violin consumers receive the exact same context object.
- No remote/floating runtime is accepted.
- Existing piano-only behavior remains available.

---

### Task 5: Exact Target-Part Violin Schedule

**Files**
- Create: `src/playback/violinAudioSchedule.js`
- Create: `test/violinAudioSchedule.test.js`
- Modify only if required: `src/practice/scoreFollowIndex.js`
- Modify corresponding tests only if required: `test/scoreFollowIndex.test.js`

**Interface**
- `createViolinAudioSchedule({ pkg, sourceId, musicXml, targetPartId, playbackContext, createIndex }) -> schedule | null`
- Schedule carries frozen unique pitches and frozen exact target events.

- [ ] RED: monophonic target produces deterministic schedule; accompaniment excluded.
- [ ] RED: exact source identity required and PlaybackPlan MIDI must match exact source MIDI.
- [ ] RED: transposition, overlap/polyphony, missing/ambiguous mapping, stale provenance return `null`.
- [ ] Implement using existing ScoreFollow indexing; do not build a second MusicXML timing parser.
- [ ] Run `node --test test/violinAudioSchedule.test.js test/scoreFollowIndex.test.js test/violinFollowCoordinator.test.js` GREEN.
- [ ] Commit `feat: derive exact violin audio schedule`.

**Acceptance**
- Schedule authorization is exact and deterministic.
- Existing fingering behavior is unchanged.

---

### Task 6: Fail-Closed Violin Audio Lane

**Files**
- Create: `src/playback/violinAudioLane.js`
- Create: `test/violinAudioLane.test.js`

**Interface**
- `createViolinAudioLane({ runtimeLoader, audioContextFactory })`
- `prepareForPackage(...) -> Promise<boolean>`
- `routeNote(...) -> "PIANO" | "EXTERNAL" | "SUPPRESS"`
- `stopAll()`
- `dispose()`

- [ ] RED: preparation selects VIOLIN and calls `preparePitches()` with exact unique pitches.
- [ ] RED: incomplete preparation returns `PIANO` for target routing.
- [ ] RED: prepared target returns `EXTERNAL` and receives exact absolute start/duration.
- [ ] RED: non-target always returns `PIANO`.
- [ ] RED: post-start engine failure calls `stopAll()` and future target notes become `SUPPRESS` for the generation.
- [ ] RED: stale generation/package and disposed lane cannot sound.
- [ ] Implement state machine with Audio Engine errors contained inside the lane.
- [ ] Run focused lane tests GREEN.
- [ ] Commit `feat: add fail-closed violin audio lane`.

---

### Task 7: One Scheduler, Two Audio Lanes

**Files**
- Modify: `src/playback/webAudioPianoEngine.js`
- Modify: `test/webAudioPianoEngine.test.js`
- Modify: `src/playback/studentPlaybackPort.js`
- Modify: `test/studentPlaybackPort.test.js`
- Modify: `src/ui/main.js`
- Modify: `test/staticShell.test.js`

**Router contract**
- `routeNote({ note, startTimeSeconds, durationSeconds, generation }) -> "PIANO" | "EXTERNAL" | "SUPPRESS"`
- best-effort external `stopAll({ generation })` lifecycle hook.

- [ ] RED engine tests: PIANO unchanged; EXTERNAL skips piano source and receives exact `beatWhen()` time; SUPPRESS emits neither lane.
- [ ] RED lifecycle tests: pause/restart/tempo/repeat/range stop/re-anchor external lane through the same generation lifecycle.
- [ ] RED port tests: violin prep occurs before full/range play only for explicit V1 violin metadata; prep false/error leaves full piano path intact.
- [ ] Implement minimal voice-router seam inside the existing scheduler; create no second interval.
- [ ] Run playback/follow regressions GREEN.
- [ ] Commit `feat: route violin through student transport`.

**Acceptance**
- Target is never intentionally double-scheduled.
- Existing scheduler remains the sole timing authority.

---

### Task 8: Offline Pinned Violin Runtime + Sample Cache

**Files**
- Vendor exact export assets: `vendor/st-score-audio/`
- Modify: `service-worker.js`
- Modify: `test/playbackOfflineAssets.test.js`
- Modify: `test/serviceWorkerRegistration.test.js`
- Create/update: `docs/audio-runtime.md`

- [ ] RED: cache name must become exactly `st-student-shell-v19`.
- [ ] RED: pinned manifest/runtime/provenance + exactly 15 WAVs are explicit same-origin playback assets.
- [ ] RED: no Practice Package/private data path is cacheable.
- [ ] RED: warm-cache offline lookup finds every required audio asset.
- [ ] Verify vendored asset byte counts/SHA-256 against the Audio Engine export before wiring cache.
- [ ] Update Service Worker once from v18 to v19; preserve required-shell vs best-effort-playback semantics.
- [ ] Run offline/service-worker tests GREEN and `git diff --check`.
- [ ] Commit `feat: cache pinned violin audio runtime`.

---

### Task 9: Browser Integration Qualification

**Files**
- Create: `browser-tests/violin-audio-follow.spec.mjs`
- Modify only if required: `browser-tests/support/student-app-e2e-bootstrap.mjs`
- Update architecture evidence: `docs/violin03-audio-architecture.md` and/or `docs/architecture.md`

- [ ] RED Chromium/WebKit scenarios: target violin route, accompaniment piano, no double scheduling.
- [ ] RED lifecycle scenarios: pause/restart/tempo/repeat/range.
- [ ] RED safety scenarios: transposition, ambiguous polyphony, induced schedule failure, stale package switch.
- [ ] Assert score highlight and fingering continue when the violin lane fails.
- [ ] Complete only bounded browser/bootstrap wiring required by tests; add no visible playback mode/control.
- [ ] Run `npm run test:browser` GREEN in configured engines.
- [ ] Commit `test: qualify violin audio follow integration`.

---

### Task 10: Cross-Repository Verification + Physical Human Gate

**Audio Engine verification**
- [ ] Exact approved runtime/export pin still available and integrity-identical.
- [ ] Run typecheck, unit, build, browser build, violin qualification, WebKit/browser, diff check on the exact integration candidate.

**Student verification**
- [ ] Run `npm install`.
- [ ] Run `npm test`.
- [ ] Run `npm run test:browser`.
- [ ] Run `git diff --check`.

**Pin/integrity verification**
- [ ] Student manifest source revision matches approved Audio Engine export pin.
- [ ] Contract/runtime are `0.2.0`.
- [ ] All 15 WAV byte counts/SHA-256 match.
- [ ] Service Worker is exactly v19.
- [ ] No private Practice Package data is cacheable.

**Physical iPhone/Safari gate**
- [ ] first user gesture unlock/resume;
- [ ] target violin onset aligns acceptably with highlight/fingering;
- [ ] pause/restart;
- [ ] tempo change;
- [ ] measure repeat/range;
- [ ] background → resume stale-audio safety;
- [ ] warm-cache offline playback;
- [ ] VoiceOver controls remain usable without repeated position announcements.

Record device/iOS/Safari versions and PASS/FAIL evidence in Notion/Linear.

**Stop condition**
- [ ] Do not merge.
- [ ] Do not deploy.
- [ ] Present exact heads, CI, physical-device evidence, offline evidence, and blockers to the human owner.

## Plan self-review result

- Tasks 4–10 cover the approved remaining dependency chain.
- All timing authority remains in Student.
- The Audio Engine public seam is transportless.
- Fail-closed transposition/polyphony/stale-work behavior is explicit.
- Offline privacy and physical-device evidence are explicit.
- No implementation step authorizes merge/deploy/Render.
