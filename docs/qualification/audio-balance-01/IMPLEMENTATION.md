# AUDIO-BALANCE-01 implementation checkpoint — 2026-10-25

Status: local implementation verified; release qualification PARTIAL. No commit, push, PR, merge or deployment performed. The user accepted the B audition timbre/attack before integration.

## Implemented behavior

- All 84 source roots measured: 30 Salamander piano, 39 FreePats guitar and 15 VSCO2CE forte violin. Static root gains reference first-one-second RMS at velocity 0.8 to -27 dBFS, no offset trimming, no duration-dependent normalization. Gain range 0.247769507–7.170293303. Provenance/blob SHA-1 is recorded in production-root-profile.json.
- Runtime candidate 0.3.0 adds opt-in bounded immutable calibration profiles and externally owned output routing. Default hosts retain their former behavior. Preparation and scheduling both reject missing roots and offsets beyond decoded buffers; cross-context outputs are rejected. Existing scheduling contract stays 0.2.0.
- Student calibrated lanes share the audition master gain and a native compressor (threshold -14 dB, knee 0, ratio 20, attack 0, release 0.15 seconds). Native compressor makeup gain can change absolute output level; final physical-device loudness/attack acceptance is still required. It does not change note pitch/time or calculate gain per requested duration.
- XML pp,p,mp,mf,f,ff and sound/note numeric dynamics are applied per musical beat and part/staff/voice. Zero is silent. Invalid numeric values fall back to valid symbols/state; unknown compound symbols and wedges retain state. Symbol MIDI policy pp32,p48,mp64,mf80,f90,ff112, normalized by127. Numeric dynamics is percent of forte90, e.g.100→90/127 and71→64/127. Old unmarked notes omit velocity and keep0.8.
- FULL plans retain producer velocity; XML enrichment requires exact source provenance and a unique one-to-one note timing/identity match. Ambiguity preserves the original trusted plan.
- Cold preparation cancelled by Pause cannot start a note later. A private preparation epoch preserves the existing public position-generation behavior.
- Offline shell v48 includes the new modules and runtime. Sample cache v1 is retained deliberately because immutable f URLs differ from p URLs. A complete old p bank is selected atomically, without f calibration, if the requested f bank cannot prepare. Future attempts retry f. An incomplete old bank fails closed; package bytes are not rewritten.

## Fresh evidence on final source

- Student: npm test — 817 passed, zero failed/skipped.
- Upstream runtime: npm test — 64 passed, zero failed; npm run typecheck/build/build:browser passed.
- Chromium 140 / headless shell build1187: two real browser cases passed (native audio measurement and existing SES-248 full Student transport/board/tempo/repeat/pause/offline-resume pilot). This was an explicit executable override because repository-pinned Playwright1.62 Chromium download failed. It is not a run on the repository's default Chromium build.
- Native OfflineAudioContext uses real decoders, nodes, summing and compression. Its unlock-state getter is overridden for offline rendering; it does not prove real-device user-gesture unlock. p RMS0.00929970 vs f0.01743693 gives1.875 (90/48); zero output peak0; 72 simultaneous voices at velocity1 produced peak0.65503323 (about -3.68dBFS). This is a corpus measurement, not a universal clipping guarantee.
- New critical-path tests observed RED→GREEN: missing expression/forwarding, quiet-sample calibration, invalid profiles/output ownership, preparation readiness, old-bank offline fallback, incomplete runtime exports and pending-Pause cancellation. Service-worker migration also seeds a v47 p sample and verifies preservation and serving under v48.
- Existing browser analyser instrumentation was adapted to observe native stems plus the shared output. The former count of two direct destination analysers no longer describes a shared-bus architecture. Source timing and all189 pilot events remain checked.

## Review findings and decisions

Fresh independent review identified offline old-bank loss, incomplete runtime exports and calibrated-buffer preparation readiness; all fixed with reproducing tests. The review also reproduced an existing pending-Pause race. Ruling: fix it within transport acceptance, using a separate preparation epoch so position-generation observers retain their contract. No deferred minor findings.

Ruling: retain immutable sample cache v1 instead of clearing all instrument downloads solely for a bank URL change; explicit old-bank fallback handles v47 readiness.
Ruling: preserve audition master gain and use measured shared protection rather than lowering every solo instrument to an extreme coherent-polyphony bound. Device audition remains a release gate because Web Audio compressor behavior affects absolute level.
Ruling: vendor an explicit source overlay and hashes while keeping sourceRevision as the honest baseline. The modified upstream source is not represented as a committed revision; promotion needs real upstream/Student review and CI.

## Remaining release gates

WebKit cannot launch in this host due missing GTK/GStreamer and related native libraries. Physical iPhone Safari/VoiceOver, cold offline-upgrade listening and final mixed-instrument loudness/timbre acceptance remain unverified. Full browser suite and remote CI have not run. Continuous crescendo/decrescendo, MIDI-volume controllers, dynamic changes inside a held tie and artificial sustain/looping are outside this initial feature. Plucked recordings naturally decay or end; they are not looped to force ten-second sustain.

## Reproduce

Student: npm ci --ignore-scripts; npm test.
Upstream baseline4f5d78a plus vendor source overlay: npm install --package-lock=false --ignore-scripts; npm run build; npm test; npm run typecheck; npm run build:browser.
Browser: ST_BROWSER_EXECUTABLE_PATH=<compatible headless Chromium> ST_AUDIO_SAMPLE_DIRECTORY=<pinned assets directory with production-root-inputs.json> node --test browser-tests/audio-balance.spec.mjs browser-tests/ses248-multipart-audio.spec.mjs.
Without the sample-directory override the tests use the actual pinned remote assets. Paths in local input metadata are environment-specific and must be regenerated on another host.

## PR preparation checkpoint

The user authorized PR creation and CI on 2026-10-25. Upstream was rebased onto aaab7b14c8b90d59c43bad78e0db7389cd266b94, preserving the existing sharp-URL fix. Its local committed candidate is 4abe08aff6a945b75593eb4070741b7d07302333. Student now pins that exact commit and the rebuilt bundle; the temporary uncommitted source overlay was removed. Upstream has 67 passing tests on the current main baseline. GitHub API tree creation returned403 Resource not accessible by integration, and no local Git write credential is available; remote publication remains blocked. This does not claim the pin is remotely available yet. Historical v0.1.1 main-triggered release automation should be reviewed before a future merge; no release workflow was changed or triggered for this PR-preparation task.
