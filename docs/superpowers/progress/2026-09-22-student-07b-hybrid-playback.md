# STUDENT-07B execution ledger

Plan: `docs/superpowers/plans/2026-09-22-student-07b-hybrid-playback.md`
Spec: `docs/superpowers/specs/2026-09-22-student-07b-hybrid-playback-design.md`
Execution branch: `feat/student-07b-hybrid-playback`
Base implementation main: `9e698fccdca95d042be07fbc1e4d6aeb3dbb939a`
Spec/plan branch head inherited: `790a42a0c767ada0ff4b995195da69766ada6518`

## Execution adaptation

Ruling: This harness has GitHub connector access but no repository-local shell/worktree execution surface. The isolated workspace is therefore the dedicated feature branch above. TDD evidence is produced by test-only RED commits followed by production GREEN commits, with GitHub Actions CI used as the executable test runner. Cost if wrong: local-only problems not represented in CI could be found later during device acceptance; exact-head CI and physical Safari acceptance remain mandatory before merge.

Ruling: The generated piano bank will contain deterministic repository-generated PCM16 WAV audio and no third-party recordings. This satisfies the spec's same-origin/offline/provenance requirement without introducing redistribution-license ambiguity. Cost if wrong: the sound is intentionally synthetic rather than a sampled acoustic piano; timbral realism is a non-goal for STUDENT-07B.

## Pre-flight shared-interface scan

- Task 1 -> Tasks 2/4: PlaybackPlan constants/validator names match the plan.
- Task 2 -> Task 4: `compileApproximateMusicXmlPlayback(pkg, { parser } = {})` matches resolver consumption.
- Task 4 -> Task 9: `resolvePackage(pkg)` matches StudentPlaybackPort consumption.
- Task 5 -> Task 6: manifest/file layout matches sample loader consumption.
- Task 6 -> Tasks 7/9: sample-bank `load/resolveMidi/dispose` matches Web Audio engine consumption.
- Tasks 7/8 -> Task 9: engine play/pause/restart/tempo/repeat/dispose surface is consistent.
- Task 9 -> Tasks 10/11: existing playbackPort methods plus quality/reference-tempo/dispose methods match Practice/controller/bootstrap integration.
- Tasks 10/11 -> Tasks 12–14: safe UI state, lifecycle, and static-cache seams match integrated verification and device acceptance.

No pre-flight interface conflict found.\n\nTask 2: Ruling: The first multi-part test expected same-onset notes sorted by MIDI, but the approved plan explicitly requires deterministic `startBeat -> partId -> voice -> midi` ordering. The test was corrected to the plan contract; production ordering was not changed. Cost if wrong: consumers would observe a different deterministic note order, but sounding simultaneity is unchanged.

Task 3: Ruling: The first Task 3 RED commit `6b48439` failed at JavaScript parse time because connector-generated fixture text preserved escaped template-literal delimiters. The fixture was corrected without production changes, and `f843006` became the meaningful RED run with nine semantic failures. Cost if wrong: none to product behavior; this ruling only identifies which CI run is valid TDD evidence.

Task 3: Ruling: A direct 100,001 playable-note MusicXML fixture cannot fit under the approved 4 MiB playback XML admission cap using ordinary valid MusicXML note syntax. The compiler still contains the 100,000 raw/playable-note guard, while automated resource-bound evidence directly covers the stronger 4 MiB source cap and 10,000-measure cap. Cost if wrong: a future more compact MusicXML representation could make the note-count guard reachable without a dedicated regression fixture; final verification must inspect the guard.

## Status

- Setup: complete.
- Task 1: complete — RED `6e56767` / CI #273: 214 tests, 213 pass, 1 expected fail (`ERR_MODULE_NOT_FOUND`); GREEN `bd78e3e` / CI #274: 225/225 PASS.
- Task 2: complete — RED `ba3c768` / CI #276: 226 tests, 225 pass, 1 expected fail (`ERR_MODULE_NOT_FOUND`); GREEN `db4cbfe` / CI #279: 233/233 PASS.
- Task 3: complete — meaningful RED `f843006` / CI #282: 246 tests, 237 pass, 9 expected semantic failures; GREEN `bd07738` / CI #283: 246/246 PASS.
- Task 4: pending.
- Task 5: pending.
- Task 6: pending.
- Task 7: pending.
- Task 8: pending.
- Task 9: pending.
- Task 10: pending.
- Task 11: pending.
- Task 12: pending.
- Task 13: pending.
- Task 14: pending.
