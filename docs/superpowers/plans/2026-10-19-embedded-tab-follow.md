# Embedded TAB Follow Implementation Plan

> Execute inline with TDD and one independent review before handing off the PR.

**Goal:** Highlight notation and TAB from an already combined MusicXML source.

**Spec:** User-approved first task in the 19 October investigation: reproduce
`smellstab-guitar-tab.musicxml`, fix exact event mapping, and verify both visible
targets. Only this task is authorized; Android startup recovery, AkorEşlik
divisions and general latency remain separate.

**Architecture:** Retain the exact playback source and clock. For an explicit
two-staff notation/TAB part, validate the two event streams against each other
and map one source event to both exact renderer refs. Reuse existing generated
TAB matching. Reject unsupported staff layout, ambiguous voice ownership and
unmatched pitch/time/duration. Do not infer pitches from fret glyphs or the DOM.

**Constraints:** No playback/audio, renderer pin, Firebase, Render, merge or
deploy change. Only the shell cache version may advance to deliver the changed
follow module to existing PWA clients. Existing single-staff and generated
TAB paths must remain green. Keep arbitrary non-TAB multistaff fail-closed.

**Review focus:** Missing/changed TAB clef; mismatched event streams; reused
voice across staves; additional non-TAB parts; first visible note after rests.

## One implementation slice

- [x] Add real Smells and bounded negative regression tests; observe RED.
- [x] Extend only `src/practice/scoreFollowIndex.js` with explicit embedded TAB
      validation and source-preserving paired refs; observe GREEN.
- [x] Add a real-runtime browser regression using the same fixture and actual
      playback resolver/coordinator; require orange notation and fret targets.
- [ ] Run `npm test`, browser checks where available, whitespace checks and
      independent review. Push an isolated branch and prepare a PR; CI results
      may remain pending. Do not merge/deploy or begin tasks 2–3.

## Evidence ledger

- Base: `308c17a45315d6931c0035c0e88d65cdae3fdeac`; clean baseline 700/700.
- Pre-flight: one production module; no shared implementation tasks.
- RED: real Smells and rest-offset mapping tests returned UNAVAILABLE.
- GREEN before review: 710/710 Node tests, 0 skips. Local browser launch blocked
  by missing executable; browser download failed, not a product-test pass.
- Ruling: advance only the shell cache v30 -> v31 because the current cache-first
  shell would otherwise retain the old follow module after release. A migration
  test first reproduced old-cache overwrite; this is part of task 1 delivery.
- Independent review identified two fail-closed gaps: a declared TAB part with
  no pitched counterpart and a TAB clef appearing after the notes it authorizes.
  Both receive RED->GREEN regressions before handoff.
- Final review fixes: both new negative tests first returned EXACT incorrectly,
  then passed after declared-part matching and document-order validation.
- Final Node suite: 712/712 PASS, zero skips. Syntax and whitespace checks PASS.
- Cache migration: v30 stale follow bytes remain isolated during install, are
  removed on activation, and the v31 worker serves the refreshed follow module.
- Real Chromium/WebKit execution remains pending CI; local browser launch was
  blocked by missing executable after browser download failure. No physical
  Android/iPhone acceptance, merge, deploy, or work on tasks 2–3 performed.
