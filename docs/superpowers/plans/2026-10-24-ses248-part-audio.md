# SES-248 part-aware audio repair implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Execute the user-approved repair in this isolated branch, then request one independent whole-branch review.

**Goal:** A delivered violin plus piano score plays both parts without sending bass accompaniment through the violin sample range.

**Architecture:** Keep the existing playback plan, tempo map, transport clock and follow identities. Resolve a bounded part-to-instrument map from the exact score and the existing explicit violin target. Prepare separate instrument engines through the existing Score Audio adapter, sharing the external AudioContext and bounded sample provider.

**Tech Stack:** JavaScript modules, Node test runner, pinned Score Audio 0.2.0, Web Audio, Chromium and WebKit CI.

**Spec:** User-approved repair in this conversation: violin and piano use their own sounds; verify current Student, transport controls and violin follow. Root cause reproduced on Student `71f1ce9d9f1ca105f3a702b513156e1d4440a2e2`: 189 notes include 35 below violin MIDI 55; the global VIOLIN selection rejects MIDI 50. The older Teacher qualification used Student `b084b69` and omitted playbackInstrument.

## Global Constraints

- Preserve canonical MIDI, all note onsets/durations, part IDs, tempo maps, existing guitar and piano behavior, and assignment schema 1.0.0.
- Use existing explicit content.violin.targetPartId and exact MusicXML MIDI program 1 for piano accompaniment; never infer roles from fixed P1/P2 IDs, display names or pitch height.
- Retain existing single-part selection semantics. Reject ambiguous multipart routing without altering or rejecting the delivered assignment.
- No dependencies, new UI, changes to the XML splitter, auth, API or production data. Merge/deploy remain separate user actions.
- Bump the Student PWA shell release v45 to v46 and cache the new module.

## Review Focus

- Non-default part IDs and a selected target other than the first part retain correct instruments.
- Pause, restart, repeat and tempo changes stop both lanes and preserve one shared beat clock.
- Late async preparation or scheduling cannot revive stopped voices or stop a newer session.
- Missing/ambiguous instrument declarations cannot silently select a wrong instrument.
- The real pinned sample resolver, rather than a mocked successful prepare, must exercise bass MIDI 48/50 alongside violin notes.

### Task 1: Resolve and play instrument parts

**Files:** new `src/playback/playbackPartRouting.js`; modify `studentPlaybackPort.js`, `webAudioPianoEngine.js`, `scoreAudioVoiceAdapter.js`; new `test/multipartPlayback.test.js`.

**Interfaces:** `resolvePlaybackPartInstruments(pkg, plan)` returns a frozen partId-to-instrument object or null for the existing uniform-instrument path. Port passes `partInstruments` with play/prepare/playRange. Engine groups pitches by resolved instrument and schedules each note on its lane. Adapter owns at most one engine per supported instrument, on the shared external context.

- [ ] Write integration regressions with the real vendored runtime and real production ports; fake only audio nodes/decoding and sample transport. Assert violin D5 and piano D3/C3 use distinct sample URLs at the same beat.
- [ ] Run `node --test test/multipartPlayback.test.js`; expect the current OUT_OF_RANGE failure before implementation.
- [ ] Implement strict routing, per-instrument preparation and adapter ownership. Add cancellation, malformed routing, non-default-ID and transport checks.
- [ ] Run focused playback, follow and package suites; then `npm test`. Expected zero failures.

### Task 2: Qualify and publish the repaired consumer

**Files:** PWA cache migration files/tests; browser regression and evidence documentation; Teacher TD-PROD-10 qualification in its own isolated branch after a Student candidate SHA exists.

**Interfaces:** Student candidate commit becomes the exact Teacher CI consumer pin; use its actual renderer pin. Teacher fixture selects VIOLIN and carries the exact target descriptor, retaining all 189 golden events.

- [ ] Refresh the PWA shell and include the new module; execute existing cache migration and offline tests.
- [ ] Exercise the current consumer with selected violin, accompaniment, pause/resume/restart/tempo/repeat and target-only fingerboard events in Chromium and WebKit CI.
- [ ] Update Teacher qualification to the candidate Student SHA and renderer, and explicit violin package; run existing service delivery regression.
- [ ] Request independent whole-branch review. Commit and publish reviewable PRs. Report exact checks and any physical-device evidence still missing.

## Progress

Baseline and root-cause evidence are recorded in the execution ledger. No claim of audible playback is made from fake decoding; native browser audio is a separate acceptance layer.
