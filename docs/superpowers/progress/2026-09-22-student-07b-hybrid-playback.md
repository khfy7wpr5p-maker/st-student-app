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

Task 7: Ruling: The selected-tempo fake-clock test jumped from 1.8 s directly to 7.8 s, so it never invoked the scheduler around the 4.0 s onset. The test was corrected to tick at 3.8 s before 7.8 s; production scheduling was unchanged. Cost if wrong: only test fidelity; real runtime ticks every 50 ms.

Task 7: Ruling: The plan mentions restart-with-repeat in Task 7 although the repeat interface is explicitly produced by Task 8. Repeat-aware restart is therefore verified in Task 8 rather than adding an unplanned early interface. Cost if wrong: no shipped behavior gap if Task 8 passes its repeat restart test.

## Status

- Setup: complete.
- Task 1: complete — RED `6e56767` / CI #273: 214 tests, 213 pass, 1 expected fail (`ERR_MODULE_NOT_FOUND`); GREEN `bd78e3e` / CI #274: 225/225 PASS.
- Task 2: complete — RED `ba3c768` / CI #276: 226 tests, 225 pass, 1 expected fail (`ERR_MODULE_NOT_FOUND`); GREEN `db4cbfe` / CI #279: 233/233 PASS.
- Task 3: complete — meaningful RED `f843006` / CI #282: 246 tests, 237 pass, 9 expected semantic failures; GREEN `bd07738` / CI #283: 246/246 PASS.
- Task 4: complete — RED `3eb2ec1` / CI #285: 247 tests, 246 pass, 1 expected fail (`ERR_MODULE_NOT_FOUND`); GREEN `5f1c904` / CI #286: 254/254 PASS.
- Task 5: complete — RED `2ae558d` / CI #288: 258 tests, 254 pass, 4 expected missing-asset failures; GREEN `f4ab023` / CI #289: 258/258 PASS. Deterministic generated bank: 12 × 220,544-byte PCM16 WAV files (2,646,528 bytes total), no third-party audio.
- Task 6: complete — RED `5736f03` / CI #291: 255 tests, 254 pass, 1 expected module-not-found failure; GREEN `bcb7446` / CI #292: 263/263 PASS.
- Task 7: complete — RED `00d0d4e` / CI #294: 264 tests, 263 pass, 1 expected module-not-found failure; first GREEN attempt `1a1a15b` exposed one fake-clock test defect; corrected test `9107cb2` / CI #296: 270/270 PASS.
- Task 8: complete — RED `7c6b0bb` / CI #299: 276 tests, 270 pass, 6 expected repeat/stale-lifecycle failures; GREEN `5280fa9` / CI #300: 276/276 PASS.
- Task 9: complete — RED `6fd1fbd` / CI #302: 277 tests, 276 pass, 1 expected module-not-found failure; GREEN `29f24f7` / CI #303: 284/284 PASS.
- Task 10: complete — RED/current failure confirmed at `2796752` / CI #310: 297 tests, 296 pass, 1 fail (`APPROXIMATE playback renders bounded quality and teacher-gated controls`); GREEN `ceabfb1` / CI #311: 297/297 PASS. Renderer now shows the bounded APPROXIMATE quality label only for APPROXIMATE playback, enforces tempo UI bounds 20..300, and binds repeat checked-state from the safe Practice view-model.
- Task 11: complete — RED bootstrap `6350ca9` / CI #313 and offline-cache `7d8b180` / CI #315 exposed the expected missing browser playback wiring and static-cache contract. The first lifecycle RED attempt also contained an accidental literal `\\n` import separator and is not counted as semantic evidence; that test-fixture defect was corrected before final verification. GREEN `0613f4b` / CI #322: 302/302 PASS. Browser bootstrap now wires resolver + local piano bank + lazy Web Audio engine + playback port; mount destroy tears down active playback ownership; Service Worker v4 caches the seven playback modules strictly with the shell and the manifest/license/notices + exactly 12 local WAV files best-effort.
- Task 12: complete — integrated failure/data-minimization regressions added across controller, playback port, renderer, and offline cache. Existing implementation satisfied the new assertions without a production-code change. GREEN `3a53ff0` / CI #327: 307/307 PASS. Fresh HEAD scan of the playback/browser integration surfaces found no canonicalEvents timing inference, external audio URL, Tone.js, or alphaTab runtime coupling.
- Task 13: complete — documentation reconciled to shipped branch behavior; CI workflow verifies `npm ci`, full `npm test`, deterministic piano-bank regeneration with zero vendor diff, and `git diff --check`. Automated code head `9d7efe3` / CI #338: 312/312 PASS, 0 fail. Independent Codex Engineering Guardrails read-only verification re-checked spec/plan compliance, parser/timing safety, async audio lifecycle/races, authority/data-minimization boundaries, offline asset completeness, generated-audio licensing/provenance, and exact-head CI evidence; no new material defect remained in the automated scope. Overall release readiness remains PARTIAL until Task 14 physical acceptance.
- Task 14: in progress — physical iPhone/Safari acceptance continues on the temporary HTTPS Pages preview. The playable 4-measure Firestore fixture was committed with the bounded seed tool. User-reported PASS now covers notation visibility, explicit-tap Play, Pause/resume/Restart, tempo speed change with stable pitch, measure repeat enable/disable, portrait/landscape rotation, Home teardown, no-autoplay reopen, visible APPROXIMATE label, sign-out teardown, and offline cached Practice playback with notation + audio after the Safari connectivity-repaint fix. Remaining unverified: VoiceOver control reachability and no raw runtime/XML/provider text announced.


## Current continuation checkpoint

- Handoff code checkpoint: `38f6039e0cbacab2b6629c1110707d9b1eee649c`
- Last fully green automated code checkpoint: `9d7efe310ae0109454261d5c1d69d4f619aa27ad`
- Last fully green automated code CI: #338 — 312/312 PASS
- Tasks 10–13 are complete for the automated development/verification scope.
- Do not restart STUDENT-07B from Task 1. The only remaining stage is Task 14 physical iPhone/Safari/VoiceOver + offline-audio acceptance.
- Task 14 is not passed until every physical acceptance item is recorded PASS; skipped/unverified is not PASS.
- Merge, production deploy, Pages/environment policy change, Firebase Security Rules change, cross-repo write, credential/billing action remain human-gated.


## Task 14 physical acceptance — partial evidence (2026-09-22)

Temporary HTTPS preview:
- Pages preview run #12 deployed branch head `50c5ba5b7a038f71c25c91aca9608d1a048677c7` successfully before the current documentation-only continuation.
- The original STUDENT-06 rest-only fixture correctly produced playback UNAVAILABLE. For STUDENT-07B physical acceptance, the bounded test fixture was changed to a 4-measure pitched MusicXML score and re-seeded to the same four fixed Firestore test documents; Cloud Shell reported `COMMITTED: 4 bounded writes`.
- On iPhone Safari, stale STUDENT-07A Service Worker v3 initially left the old browser bootstrap active even while new Firestore notation data was visible. Closing/reopening Safari allowed the STUDENT-07B bootstrap to become active. Later, network-off testing exposed a real Safari repaint defect: connectivity-state repaint could destructively replace the live notation SVG root while playback remained active. A RED regression test reproduced the loss, `mountStudentApp` was fixed to detach the active renderer root before `innerHTML` repaint and restore the same node afterward, and the shell cache revision was bumped from v4 to v5 so iPhone Safari would receive the corrected `main.js`. CI #370 and Pages preview #19 passed before the successful physical offline retest.

User-reported physical results:
1. Authorized Practice notation visible with the 4-measure score — PASS.
2. `Dinle` starts audible piano only after user tap — PASS.
3. `Duraklat` stops playback — PASS.
4. `Dinle` resumes from the paused musical position — PASS.
5. `Baştan` restarts from score start with repeat off — PASS.
6. Tempo control changes playback speed while pitch remains stable — PASS.
7. Enabling measure repeat during playback loops the captured measure — PASS.
8. Disabling measure repeat exits back to normal flow — PASS.
9. Default MusicXML route visibly shows the bounded APPROXIMATE quality label — PASS.
10. Portrait/landscape rotation does not duplicate/restart playback or break notation — PASS.
11. Going Home during playback stops audio immediately — PASS.
12. Reopening Practice does not autoplay; a new explicit tap is required — PASS.
13. Signing out during playback stops audio immediately — PASS.
14. After online cache warm-up, disabling Wi-Fi/cellular and reloading still allows cached Practice notation and piano playback — PASS. Initial attempt exposed Safari notation-root loss while audio continued; fixed and physically revalidated.
15. VoiceOver reaches Play, Pause, Restart, tempo, and repeat controls when exposed — PENDING.
16. VoiceOver/UI does not expose or announce raw XML/runtime/provider/plan details — PENDING.

Skipped or unreported checks remain PENDING and are not counted as PASS.

## Task 13 independent verification matrix

- Spec/plan compliance -> reviewed complete branch against STUDENT-07B plan/spec -> PASS for automated scope.
- Timing authority -> production playback path does not read `content.canonicalEvents`; FULL requires validated trusted plan; default supported MusicXML is APPROXIMATE -> PASS.
- Parser/resource bounds -> 4 MiB XML admission, 100,000-note and 10,000-measure plan bounds, backup-underflow fail-closed tests -> PASS.
- Audio lifecycle/races -> generation invalidation, package disposal, async tempo/repeat stale-success guards, Web Audio constructor capability fail-closed -> PASS.
- Data minimization -> raw MusicXML/plan/provider/sample errors remain outside safe UI/HTML -> PASS.
- Offline assets -> Service Worker v5 strict playback module graph + best-effort manifest/license/notices/exact 12 WAV set; private Practice Packages remain IndexedDB-owned -> PASS.
- Audio provenance -> repository-generated deterministic PCM16 bank, no third-party recordings, explicit license/notices and manifest hashes -> PASS.
- Exact-head automated evidence -> code head `9d7efe310ae0109454261d5c1d69d4f619aa27ad`, CI #338, 312/312 PASS plus deterministic regeneration/diff and whitespace check -> PASS.
- Physical iPhone/Safari/VoiceOver/offline-audio acceptance -> not executed in this automated verification -> PENDING / Task 14.
