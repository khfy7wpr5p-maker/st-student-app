# Student chord appearance qualification — 2026-11-01

The approved Guitar Chord Board 0.22.0 appearance is adapted from commit
`7fb86d231c35e6d3ce7bc07c5b0cfbd845da4b30` to both Student chord routes.
Student baseline: `38c7a8ad5aa8df638ec0c7bded363f5086ae2dd1`.
This is feature-PR evidence, not a production deployment or device acceptance.

## Scope and compatibility

- Keep the existing authorized snapshot, musical geometry, exact fret/finger/barre
  metadata, Turkish semantic descriptions and teacher notes.
- Add inline wood/metal/ivory SVG materials, string 6–1 and actual fret numbers.
  New CSS is scoped under `.chord-board-workspace`; no remote image, dependency
  or animation is introduced.
- Each direct SVG render owns unique resources, including repeated calls with
  the same model. Each immutable workspace retains its SVG across no-op paints;
  standalone and Piece have separate instances. This preserves the existing
  `mountStudentApp` HTML-equality optimization and transient control state.
  Mutable ad hoc inputs render fresh. The app still owns one workspace per route.
- Shell v50→v51 migration preserves active v50 index/chord bytes until activation,
  then removes the old shell while retaining v18 compatibility and sample cache v1.
- No catalog, provenance, dependency, controller, mount, audio, SCORE/TAB, violin,
  private offline data or external repository implementation is changed.

## Fresh verification

Node 24.22.1 and repository Playwright 1.62.1; exact Chromium 151.0.7922.34
and WebKit 26.5 executables with locally extracted native dependencies.
CI browser/runtime configuration is unchanged.

| Check | Result |
| --- | --- |
| `npm test` | 851 passed; zero failed/skipped |
| Full WebKit browser suite, concurrency 2 | 29 passed; zero failed/skipped |
| Full Chromium browser suite, concurrency 2 | 28 passed; one baseline SCORE replay-point assertion failed |
| New chord materials tests, both browsers | All three passed in each full suite |
| Piano-bank regeneration | 12 samples generated; no vendor diff |
| `git diff --check` | Passed |
| Fresh independent whole-change review | No outstanding Critical/Important/Minor findings |

The material checks cover standalone and Piece, open/muted strings, fifth-position
barres, local resource ownership, coexisting violin/score, and 320×568, 390×844,
844×390 and 768×1024 viewports. Generated phone/iPad screenshots were inspected.
Existing Piece repeat/tempo/focus/Nota/TAB controls and the native violin/piano
pilot pass after preserving workspace SVG identity.

Cache reopening uses the real worker and a fresh document. Chromium disables connectivity with
network emulation; WebKit uses the repository's origin-503
method because its offline emulation disables the service worker. No cached shell
or module request reaches the unavailable origin. An uncached probe verifies the
unavailable network path; cached assets alone do not masquerade as connectivity.

Chromium native-audio checks use the existing `ST_AUDIO_SAMPLE_DIRECTORY` option:
23 production public source samples (18,052,439 bytes) were downloaded and checked
against the recorded Git blob hashes. Fetch delivery is local; decoders, native
audio nodes, timing and processing remain real. WebKit's full run uses the pinned
remote assets directly. No samples or host-specific paths are committed here.

## Remaining qualification boundary

`browser-tests/interactive-score-follow.spec.mjs:524` fails the same Chromium
"note point must request one bounded replay" assertion on unchanged baseline
and candidate in this host. WebKit passes it. This visual change does not modify
the score resolver/renderer, and does not claim that existing Chromium case is
fixed. Remote CI must be evaluated separately from this local result.

Physical iPhone/Safari, VoiceOver navigation and listening acceptance were not
performed. Automated semantic checks are not substituted for physical acceptance.
