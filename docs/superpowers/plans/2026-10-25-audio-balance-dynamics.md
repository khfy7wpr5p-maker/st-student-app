# Audio balance and XML dynamics implementation plan

> For agentic workers: use superpowers:executing-plans to implement task-by-task after design review.

**Goal:** Balanced instrument playback and independent XML p/f expression.
**Architecture:** Qualified sample profiles and shared output headroom; optional note velocity from MusicXML to existing scheduler.
**Tech Stack:** Existing JavaScript/TypeScript, Web Audio, Node tests and Playwright; no new runtime dependency.
**Spec:** ../specs/2026-10-25-audio-balance-dynamics-design.md

## Global constraints

Preserve package schema, note identity/timing, teacher delivery, offline support and board target. No minified vendor edits, automatic release, fixed +21 dB boost or unqualified sample substitution. No-dynamics velocity remains 0.8. Physical-device checks cannot be inferred from Node tests.

## Review focus

- Short violin attacks and long sustains must both be audible and natural.
- Staff/voice-specific dynamics must survive backup/forward and arbitrary part order.
- Zero, invalid values, explicit percentages and omitted values must stay distinct.
- Dense chords must be measured after summing; old piano must not be attenuated twice.
- Offline cache upgrade must load the exact new runtime and matching asset profile.

### Task 1: qualify the sound candidate

Files: upstream sample manifests/profile tests and qualification documentation; preserve original assets.
Produces: accepted provenance/checksums, region profile, level/attack measurements, audition fixture.
- [ ] Reproduce baseline across the spec's pitch/duration matrix, with raw and summed peaks.
- [ ] Audition p/f layers and candidate preparation; document coefficients and rejected candidates.
- [ ] Obtain user audition acceptance of the selected timbre/attack before production pinning.

### Task 2: upstream calibrated output

Files: st-score-audio-engine packages/web/src/audio-engine.ts, manifest.ts, manifest-sample-provider.ts; corresponding tests and version/build metadata.
Consumes: Task 1's accepted profile.
Produces: rebuilt versioned runtime with opt-in calibration and shared destination support.
- [ ] Write failing real-buffer tests for quiet sample amplification, zero velocity, no hard clipping, cancellation, cache bounds, sample exhaustion, foreign-context output rejection, host-node ownership and legacy defaults.
- [ ] Run targeted tests and record the intended failures.
- [ ] Implement opt-in calibrated output, keeping existing hosts' defaults.
- [ ] Run upstream full checks, browser signal tests and summed waveform qualification.

### Task 3: independent MusicXML dynamics

Files: Student src/playback/musicXmlApproximatePlayback.js, playbackPlan.js, playbackPlanResolver.js, webAudioPianoEngine.js, scoreAudioVoiceAdapter.js; new focused expression module if needed; affected Node tests.
Produces: optional note.velocity passed through every playback path.
- [ ] Write failing compiler-to-scheduler tests: violin f/piano p, reverse part order, same-part multiple staves/voices, backup/forward, note override, offset sound flags, ties, zero and invalid values, later part-wide directions overriding older local directions, and FULL-plan exact-provenance enrichment/ambiguous-match abstention.
- [ ] Verify numeric dynamics=100 yields 90/127 and dynamics=71 yields 64/127; old fixtures omit velocity entirely.
- [ ] Implement beat/scope resolution and optional-field validation/forwarding, including the legacy sample lane.
- [ ] Run node --test test/musicXmlApproximatePlayback.test.js test/playbackPlan.test.js test/playbackPlanResolver.test.js test/scoreAudioVoiceAdapter.test.js test/webAudioPianoEngine.test.js test/multipartPlayback.test.js
- [ ] Run npm test; report every failure and classify it.

### Task 4: Student integration and release qualification

Files: src/ui/main.js, scoreAudioVoiceAdapter.js, vendor/st-score-audio runtime manifest/generated bundle, service-worker.js and offline/browser tests.
Consumes: accepted runtime/profile from Task 2 and expression from Task 3.
- [ ] Test shared destination, sample routing, absent expression defaults and cold/warm offline upgrade before updating the pin.
- [ ] Update generated vendor runtime/version/hash and shell asset graph atomically.
- [ ] Run npm test and npm run test:browser in Chromium/WebKit; measure real mixed audio, not just nonzero analyser output.
- [ ] Complete physical iPhone Safari/VoiceOver and teacher/student delivery acceptance.
- [ ] Review diff, report remaining limitations, and request separate merge/deploy authorization with the exact candidate.
