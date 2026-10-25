# AUDIO-BALANCE-01: sample calibration and MusicXML dynamics

Status: approved and locally implemented; see ../../qualification/audio-balance-01/IMPLEMENTATION.md for verification and outstanding release gates.
Baseline: Student a0b422a6075bd957e7d70dd2257abe265e94587e; pinned audio runtime 4f5d78a3e54a6f005a4c4d810e8ff404a988b0a5.
The user approved the two outcomes: balanced piano/guitar/violin and independent XML p/f playback. This document makes the implementation choices reviewable.

## Goals and invariants

First qualify the violin sound bank, then apply instrument calibration, then add XML expression. Melody, timing, tempo, part IDs, ties, transport, orange/green tracking and violin board target must stay intact. No teacher UI, assignment schema migration, API change, rewriting assignments, or automatic publication. Existing assignments with no dynamics retain their current expression default of 0.8. Calibration is intentional for the selected instrument, including older assignments.

## Approaches

Recommended: qualify sample preparation and pitch-region calibration independently from musical velocity; route all qualified voices through one shared gain/headroom stage. Add optional validated note velocity to Student's internal playback plan. Public Score Audio scheduling already supports velocity; sample calibration and destination routing need a separately versioned upstream runtime revision and vendor pin.

Rejected after measurement: applying a fixed +21 dB boost to every violin note. Across five pitches, violin/piano RMS differences after this boost span -8.6 to +7.6 dB at 0.5 seconds and +5.5 to +19.7 dB at 2 seconds. Two complete boosted recordings exceed full scale. A fixed sample offset also leaves pitch-dependent imbalance and can cut the bow attack. Neither is a production recipe.

Alternative: replace the violin bank entirely. Retain as a fallback if preparing the current CC0 bank cannot pass audition and measurement; replacing timbre requires explicit user acceptance of the candidate. Do not silently substitute an unrelated synthesizer or sample bank.

## Stage A: sample qualification before choosing coefficients

Use the exact pinned external assets; preserve provenance/checksums and CC0 attribution. Evaluate existing p/f layers as candidates, with source SFZ region settings as evidence rather than copying those settings blindly. Compare MIDI 55,60,64,67,69,72,76,79,84,88,91,93,96 and interpolated notes with durations 0.125,0.25,0.5,1,2,5,10 seconds. Include guitar's and piano's wider ranges and six-note chords.

Output a candidate table: source, region, attack handling, gain, peak, RMS, integrated loudness where meaningful, and audition result. Never normalize separately for each requested note duration: that would change musical articulation and introduce pumping. Do not shift musical onset to compensate for a sample. Accept a candidate only after short notes remain clear, sustained notes remain natural, p<f remains audible, and a user auditions it. Exact gain/attack coefficients remain deliberately unselected until this evidence exists.

## Stage B: runtime calibration and headroom

Keep calibration separate from velocity; the current min(1, velocity*sampleGain) prevents meaningful amplification of quiet samples. Proposed upstream extension: a bounded opt-in sample calibration profile and optional output AudioNode, defaulting to current behavior for other hosts. All Student Score Audio instruments share the same output stage; legacy local piano must not be attenuated twice. No nonlinear per-note hard clipping. Measure the summed signal before destination for dense chords and three-instrument mixtures; target summed-output sample peak <= -3 dBFS for the qualification corpus, and document that this corpus target is not a universal mathematical clipping guarantee. Prefer conservative gain staging; any protective compressor must have measured attack/release and musical acceptance, not hide a bad calibration.

Version and rebuild upstream source, verify bundle hash, then update Student's runtime version check, vendor manifest and offline shell atomically. Do not hand-edit the minified bundle. Maintain a rollback pin and sample-cache version when URLs/bytes change. Raw/decoded cache bounds must remain bounded. The proposed outputNode must belong to the same AudioContext; reject a mismatch before scheduling, and never disconnect or dispose a host-owned node. Profile v1 contains instrumentId plus per-rootMidi {gain, offsetSeconds}: finite gain [0,16], offsetSeconds [0,2] strictly below buffer duration. Defaults are gain=1/offset=0. Bounds are validation limits, not accepted coefficients; reject duplicate or unknown sample roots. The calibrated path keeps envelope velocity [0,1] separate from profile gain and shared headroom. Validate source exhaustion and preserve natural decay; do not loop plucked samples. Sustained looping or extension would be a separate explicitly accepted profile capability, with seam tests; unavailable duration support must be documented.

## Stage C: MusicXML expression

Implement pp,p,mp,mf,f,ff. Symbol MIDI velocities are a documented product policy, not MusicXML-mandated values: pp=32,p=48,mp=64,mf=80,f=90,ff=112. Normalize explicit MIDI velocities by 127. Thus explicit f=90/127 is intentionally different from the compatibility default 0.8; no-marking legacy preservation is not a claim that old playback matched MusicXML forte. No marking means omit the optional field and retain 0.8.

MusicXML numeric dynamics are percentages of MIDI forte=90, NOT percent full-scale gain. Convert sound/@dynamics and note/@dynamics using min(127,round(90*value/100))/127; accept zero as silence. Ignore nonfinite/negative numeric expression without making an otherwise playable score unplayable; continue to the valid co-located symbol, then active direction, then absent-value default. At the same location note numeric overrides note symbols, which override active direction state. Numeric sound dynamics overrides co-located direction symbols in the same scope. MIDI volume is a separate part-level controller, not a synonym for velocity; do not fold it silently into this phase.

Build expression events per part/staff/voice and musical beat; resolve after backup/forward and measure offsets, not by mutating one global state while parsing document order. Direction sound offsets override direction offsets; direction offsets affect playback only with sound=yes. Note-local dynamics affect that note, not later notes. For each note use the latest applicable event by musical beat; at the same beat specificity (voice/staff, then part) breaks ties, followed by document order within the same scope. A later part-wide direction supersedes older staff/voice directions. Part IDs are arbitrary. Unknown compound marks and wedges remain unsupported expression, with the prior valid state retained. Continuous crescendo/decrescendo and changes inside a held tie are outside the initial p/f feature; tied notes retain attack velocity.

For FULL trusted plans, retain valid producer velocities; otherwise enrich from XML only when exact source provenance and deterministic one-to-one note identity/timing matching are verified. An ambiguous match abstains from enrichment and preserves the trusted plan; never guess by note array index. Add playbackPlanResolver.js and its tests to this scope.

Carry optional finite velocity [0,1] through compiler/publicNote, validator, trusted-plan normalization, scheduler and adapter, without adding fields to old no-dynamics notes. Legacy sample playback must apply the same optional velocity semantics while preserving the old absent-value envelope. Test pause/resume, tempo, repeat and seek to a later measure using precompiled expression rather than resetting dynamics to defaults.

## Verification and release

Fresh focused tests plus npm test; real browser tests in Chromium and WebKit; physical iPhone Safari/VoiceOver, offline cold/warm sample availability and PWA upgrade. Preserve assignment delivery, pool, secure recipient isolation and package bytes. Browser engines are not installed in the current scratch environment; do not report browser or device PASS from Node mocks or FFmpeg measurements. User merge/deploy approval remains separate.

Sources: W3C MusicXML 4.0 sound, note, dynamics and offset reference; Context7 Web Audio standard channel summing/start semantics; pinned Student and Score Audio sources; VSCO-2-CE 1.1.0 SViolinVib.sfz and SViolinVib-Quiet.sfz. Prior focused Node baseline: 26 passed, not an audio-balance acceptance test.
