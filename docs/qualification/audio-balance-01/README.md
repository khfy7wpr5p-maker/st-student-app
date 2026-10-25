# AUDIO-BALANCE-01: audition candidate, 2026-10-25

Status: objective qualification PARTIAL; user audition pending. No product code, vendor pin or service-worker change. The candidate is an offline audition, not a deployed fix or an XML dynamics implementation.

52 source assets, 364 solo measurement cases across 0.125/0.25/0.5/1/2/5/10 seconds. Exact pinned Salamander, FreePats and VSCO2CE 1.1.0 assets; source URLs and Git blob checksums in candidate-profiles.json. NumPy/FFmpeg decoding at stereo 44.1kHz, fractional pitch-rate interpolation for non-root notes; CPU analysis is not browser Web Audio certification. RMS windows zero-pad after natural source exhaustion, deliberately making exhaustion visible.

## Audition

AUDIO-BALANCE-01_Keman_A_B.mp3: A 0–21.70 seconds, silence 21.70–22.70, B 22.70–44.40. Both use identical note onsets/durations, piano accompaniment, and shared master gain. Each section has violin quarter-second notes, half-second notes, two-second notes, then guitar/piano. The guide lists approximate whole-second timestamps; B starts at 22.699977s.

A uses existing p violin and uncalibrated instrument levels. B uses the same bank's f layer with static per-sampled-pitch calibration to -27 dBFS first-one-second RMS at velocity 0.8. Offset=0 for every sample, no trimming, no pitch/timing shift, no per-note-duration normalization, no loops or invented sustain. Candidate coefficients are experimental, not production constants. Some sampled piano pitches are transposed from a nearby source root; these audition gains must not be misinterpreted as a complete production per-root profile. A separate mapping/qualification of every source root is needed before pinning.

Common playback envelope: gain through note duration, linear release (.12 piano/.18 guitar/.2 violin), then silence. The -27 reference is an experimental comparison policy, not a psychoacoustic equality claim. f-layer timbre must be accepted by the user before promotion.

## Evidence

- Candidate gain range: 0.247770–5.657691; master gain 0.235349277, same in A/B.
- Worst measured dense mix after master: -4.00 dBFS. Corpus: all seven durations, six simultaneous notes in each of three lanes (18 voices), plus six identical coherent voices for each selected note/instrument. This is a measured corpus bound, not a universal clipping guarantee.
- PCM audition peak: -14.59 dBFS; decoded MP3 peak -14.64 dBFS.
- Source exhaustion: 32 cases, by instrument {'GRAND_PIANO': 5, 'CLASSICAL_GUITAR': 27}. Natural plucked decay remains; do not loop guitar/piano to make them sustain.
- Existing Student baseline: npm test, 801 passed / 0 failed. These are baseline tests, not evidence of an implemented feature.
- No browser/device listening, integrated LUFS, production calibration or XML p/f implementation PASS claimed.

## Next gate and remaining work

Ask the user to audition B's bow attack/timbre versus A. If accepted, qualify complete root mappings and upstream runtime calibration/output extension with RED→GREEN tests. Then implement MusicXML per-part/staff/voice expression and trusted FULL-plan enrichment under the approved design, and perform browser/device/offline release checks. No production pin before audition acceptance. No merge/push/deploy authorized here.
