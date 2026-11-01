# Student Realistic Chord Board Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session.

**Goal:** Match the approved 0.22.0 guitar appearance in both Student chord views.

**Architecture:** Preserve the validated Student view model and shared renderer
interface; add inline SVG materials and component-scoped overrides. Existing
audio, assignments, SCORE/TAB, violin and dependencies keep their implementations.

**Tech Stack:** Existing JavaScript/SVG/CSS, Node test runner, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-11-01-realistic-chord-board-design.md`

## Global Constraints

- No new dependency, remote asset, authority/data change or external repo edit.
- Preserve `renderChordDiagramSvg(viewModel)`, exact frets/fingers/barres and accessible descriptions.
- Both standalone CHORD_BOARD and Piece Akorlar use the new appearance.
- Scope all new styles to `.chord-board-workspace`; keep other existing styles.
- Private SVG IDs must be unique across simultaneous chord/violin/score views.
- Shell v50 upgrades atomically to v51; existing samples/private offline records remain intact.

## Review Focus

- Open/muted strings, high positions and barres retain exact assignment geometry.
- Multiple SVGs do not share resource IDs or paint the accepted violin differently.
- Narrow phones and iPad keep labels visible and legible with existing navigation.
- SCORE/TAB, audio, VoiceOver and private offline access remain unchanged.
- Cached v50 chord/index bytes survive install until activation, then update to v51.

### Task 1: Adapt and verify the approved visual

**Files:** `src/ui/chordDiagramSvg.js`, scoped additions in `index.html`,
`src/ui/renderChordBoardWorkspace.js`, `service-worker.js`, affected shell-version assertions and chord UI tests,
`browser-tests/chord-board-materials.spec.mjs`, architecture/design records.

**Interfaces:** Input remains the validated Student chord view model; output is
the same accessible SVG contract with private material resources, string 6–1 and
actual-fret labels. Package data and controller APIs do not change.

- [ ] Add failing renderer tests for string/fret labels, high-position nut omission and unique self-contained material references across two renders. Run the focused tests and inspect expected failures.
- [ ] Port the approved presentation to the existing model, scope CSS to chord workspaces and preserve all data attributes. Re-run focused tests.
- [ ] Add browser checks for both views, 320/390/768 widths, coexisting violin/score styles, material IDs, and offline reopening.
- [ ] Preserve no-op Student paints with stable per-workspace SVG instances; verify direct render calls remain unique and existing Piece repeat/transport controls still work.
- [ ] Extend the cache migration fixture with stale v50 index/chord assets; confirm the new expectation fails, then bump the worker to v51 and update the existing version assertions.
- [ ] Run full `npm test`, deterministic piano-bank check, whitespace check and both browser engines; inspect actual phone/iPad screenshots.
- [ ] Commit reviewed code and create a feature PR against current main; report test evidence and remaining physical-device acceptance separately.
