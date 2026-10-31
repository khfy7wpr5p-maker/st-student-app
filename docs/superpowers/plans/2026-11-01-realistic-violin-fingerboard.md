# Realistic Violin Fingerboard Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the approved scope inline, then request one fresh whole-branch review.

**Goal:** Apply the approved realistic violin appearance to existing and new eligible Student work without musical behavior changes.

**Architecture:** Keep the existing snapshot-driven presenter and geometry. Translate the approved decorative SVG/CSS into the shared view, with unique material IDs for each presenter and each compact/detail surface. Refresh only the static shell version.

**Tech Stack:** Existing JavaScript ES modules, inline SVG, CSS, node:test and Playwright; no dependencies added.

**Spec:** `docs/superpowers/specs/2026-11-01-realistic-violin-fingerboard-design.md`

## Global Constraints

- `viewBox="0 0 320 112"`, G/D/A/E y=20/44/68/92; x=40+normalizedPosition*260.
- Playback, follow coordinators, package eligibility and delivery remain unchanged.
- Open 0, clearing, Turkish accessibility text and controls remain unchanged.
- Existing compact dimensions and detail lifecycle remain unchanged.
- No external assets, new dependencies or musical timers. No merge/deploy.

## Review Focus

- Hidden detail and a second presenter cannot capture another SVG's resources.
- Open strings, rest and invalid snapshots cannot retain a stopped marker.
- Long scores at measures 21/24 and both phone orientations remain visible.
- Typography, badges and decorative shadows cannot enlarge the compact dock.
- Existing installed PWA shell upgrades retain private packages and samples.

### Task 1: Adapt the shared presentation

**Files:** Modify `src/ui/violinFingerboard.js`, `index.html`, `src/ui/piece-workspace-fusion.css`, `test/violinFingerboard.test.js`, `test/violinCompactLayout.test.js`.

**Interfaces:** Keep `createViolinFingerboardPresentation({root}).show(snapshot)/clear()`; preserve canonical position values and semantic descriptions.

- [ ] Add a focused DOM test for local material references across compact/detail and separate presenter roots. Run it against the old view and confirm missing material definitions fail.
- [ ] Adapt only decorative drawing, compact typography and violin-scoped surfaces from the pinned MagicPath reference. Keep each live snapshot dynamic, not the prototype's examples.
- [ ] Run `node --test test/violinFingerboard.test.js test/violinCompactLayout.test.js test/violinDockPresentation.test.js test/violinFollowCoordinator.test.js test/violinLearningRuntimeAssets.test.js`. Expected: all pass.
- [ ] Inspect the diff and commit the view and its focused checks.

### Task 2: Refresh and qualify the offline view

**Files:** Modify `service-worker.js`, the five tests currently asserting shell v49, `browser-tests/violin-compact-dock.spec.mjs`, and the current architecture snapshot.

**Interfaces:** New shell `st-student-shell-v50`; retain the existing cache installation/activation algorithm, v18 compatibility cache, IndexedDB and audio caches.

- [ ] Extend existing migration coverage to seed the installed v49 shell, require atomic v50 installation and old-shell removal after activation. Observe failure before the version change.
- [ ] Bump only `SHELL_CACHE_NAME`, update current-version expectations and add short architecture provenance for this visual change.
- [ ] Run the focused cache suites and `npm test`. Expected: all pass.
- [ ] Run existing Chromium/WebKit browser suites, inspect compact/detail screenshots and verify unchanged protected files. Record any environment limitation rather than claiming PASS.
- [ ] Commit the release preparation, request fresh whole-branch review, address material findings and publish a draft feature PR. Do not wait on CI or merge/deploy.
