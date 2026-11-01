# Realistic violin fingerboard — implementation and qualification

Approved reference: MagicPath project `465886118261428224`, component
`465886123739189248`, revision `467386809148641280`.
Source baseline: `e8f273fd8623a275303e1777d5f67561b36b9285`.

## Implemented scope

The shared presenter uses the approved ebony/maple/metal appearance and amber
marker. Existing eligible assignments and new ones use the same view. Snapshot
authority, normalized positions, string rows, open zero, clearing, Turkish
descriptions, controls and compact/detail lifecycle are retained. Material IDs
are local to each presenter and each surface. Shell v50 upgrades the static
view while preserving the existing cache activation and private-data rules.

## Fresh verification

- Baseline `npm test`: 846/846. Final `npm test`: 847/847.
- Presenter/coordinator/dock/runtime checks: 27/27; cache checks: 17/17.
- Chromium violin browser checks: 6/6, including altered-note card geometry
  and placement contrast. Portrait/landscape, stopped/open strings, long-score
  measures 21/24 and expanded detail were inspected in actual rendered output.
- Independent whole-branch review found no Critical issues and two Important
  issues: long altered-note labels grew the card by ~17.4px, and placement text
  had 3.8758:1 contrast on the darkest approved surface. Both were reproduced
  with failing browser checks, fixed and verified green. Badge paint no longer
  changes glyph widths; fingering information is neither clipped nor hidden.
- Deterministic piano bank and `git diff --check`: pass. Playback/practice,
  vendored runtimes, dock behavior, workspace control rendering, bootstrap and
  dependency manifests remain unchanged against the baseline.

## Qualification gaps and deferred work

Full Chromium: **23/26**. These same three failures reproduced on untouched
baseline main in the same environment; they are not claimed fixed here:

1. `native audio renders XML p/f, zero velocity and 72-voice overload protection`
   — audio playback unavailable.
2. `real renderer SCORE geometry drives bounded replay, cursor, and exact highlights`
   — note point does not request a bounded replay.
3. `SES-248 selected violin and piano pilot produce native audio with current Student controls`
   — audio preparation timeout.

WebKit downloaded but cannot launch because host libraries are missing. The
supported `playwright install-deps webkit` attempt failed on container
setgroups/setuid operations. No WebKit/browser or physical iPhone/VoiceOver PASS
is claimed. CI browser/release qualification and physical-device acceptance
remain open; this work does not authorize merge or deployment.

One review minor is deferred: equal snapshots still rebuild both SVGs. A
desktop Chromium parse-only measurement was ~0.0816ms/update on main and
~0.4017ms/update on the candidate (16 versus 96 compact descendants). This does
not measure actual frame time or establish performance on an older phone/PC.
Avoiding duplicate redraws would be a separate presentation optimization with
its own lifecycle coverage.
