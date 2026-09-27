# STUDENT-09 Interactive Score Follow V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe read-only measure-tap replay, automatic measure cursor, and exact active note/chord highlighting to the Student App SCORE view without changing student authority, canonical score data, TAB behavior, offline ownership, or the permanent deployment topology.

**Architecture:** Keep timing/playback ownership in Student App and presentation ownership in the pinned renderer. Build a Student-owned `ScoreFollowIndex` from the exact SCORE MusicXML plus a validated playback context, bind it to the current `sourceId + renderEpoch`, and orchestrate measure hit-test/cursor/highlight through the notation adapter. Exact highlight is independently gated by same-source timing/event provenance; measure replay/cursor can remain available when highlight provenance is unavailable.

**Tech Stack:** Node.js 24, native `node:test`, browser DOMParser/`@xmldom/xmldom`, Web Audio API, Playwright 1.62.1 Chromium + WebKit, ST Score Rendering Layer contract `0.2.0`, SonarQube Cloud GitHub check.

**Spec:** `docs/superpowers/specs/2026-09-27-student-09-interactive-score-follow-design.md`

## Global Constraints

- Baseline Student main: `ced3f4366ffccf42bc82aa70d0bcb3cef770621e`.
- Exact renderer revision: `13aa0843158257a207afe062879743d58048cc6d`.
- Renderer contract remains `0.2.0`; no base-contract bump.
- `PlaybackPlan.schemaVersion` remains `1`; renderer locator identity is not added to the public PlaybackPlan schema.
- SCORE follow authority is bound to the exact SCORE source only; generated TAB must not reuse SCORE identity.
- No pitch, MIDI, duration, onset-nearness, geometry, DOM/SVG, nearest-note, or nearest-measure fallback.
- Rest-only/silent part-measure membership comes from exact SCORE MusicXML, never only from `PlaybackPlan.notes`.
- FULL/APPROXIMATE quality alone never grants exact highlight; exact highlight requires deterministic same-SCORE timing/event provenance.
- Measure replay is global `[startBeat, endBeat)`; the tapped part is not a solo request.
- No student editor, OMR, microphone/MIDI scoring, teacher canonical mutation, Secure Delivery authority change, or Firebase authority change.
- `#st-score-root` remains persistent under existing lifecycle behavior.
- Service-worker cache advances exactly once from `st-student-shell-v16` to `st-student-shell-v17`.
- No new Render service/domain/URL. Permanent Student URL remains `https://st-student-app.onrender.com`.
- No merge without Human Merge Gate. No deployment without Human Deploy Gate.
- Physical iPhone/Safari acceptance is after approved deployment; Playwright WebKit is not a substitute.

## Review Focus

1. **Rest-only tapped part:** a renderer HIT on a part containing only rests in that measure must still replay the global measure when another part has playable notes. Pin in Task 3.
2. **Valid FULL plan with no provenance:** playback remains valid but `eventMapping` must be `UNAVAILABLE`; measure replay/cursor may still work. Pin in Tasks 2–3.
3. **Stale renderer evidence:** a render replacement between tap/position callback and renderer operation must not replay, move cursor, or highlight using the old epoch/source. Pin in Tasks 1 and 6.
4. **Notes crossing range boundaries:** one-measure playback must retrigger notes already active at range start and clip all sound at the measure end without wrapping. Pin in Task 4.
5. **SCORE → TAB → CHORDS → SCORE plus offline reload:** no SCORE identity reuse in TAB, no detached score root, and the v17 cache must contain the new runtime/modules. Pin in Tasks 7–8.

---

## File Structure

### New focused modules

- `src/practice/scoreFollowIndex.js` — exact source-derived measure membership, renderer note identity, measure lookup, beat lookup, and event-mapping authority.
- `src/practice/scoreFollowCoordinator.js` — current render binding, tap-to-measure replay, position subscription, cursor/highlight de-duplication, and stale-evidence cleanup.
- `test/scoreFollowIndex.test.js` — source/provenance/rest/ties/chords/polyphony tests.
- `test/scoreFollowCoordinator.test.js` — orchestration and stale-binding tests.
- `browser-tests/interactive-score-follow.spec.mjs` — real renderer/runtime SCORE interaction evidence.

### Existing modules to extend

- `src/playback/playbackPlanResolver.js` — preserve `resolvePackage`; add internal playback-context/provenance resolution.
- `src/playback/studentPlaybackPort.js` — expose bounded follow playback context, one-measure playback, and package-filtered position subscription.
- `src/playback/webAudioPianoEngine.js` — bounded range playback and scheduler-owned position subscription.
- `src/practice/notationAdapter.js` — exact render evidence plus bounded renderer interaction bridge.
- `src/ui/studentAppController.js` — internal-only SCORE follow source accessor; no new student action.
- `src/ui/mountStudentApp.js` — bind/unbind coordinator after notation lifecycle and route non-control score taps.
- `src/ui/main.js` — compose coordinator with the existing notation adapter/playback port.
- `service-worker.js` — v17 plus new local modules.
- `.github/workflows/ci.yml` — exact renderer SHA and exact regenerated runtime path.
- `vendor/st-score-runtime/**` — canonical regenerated browser runtime only.
- `README.md`, `docs/architecture.md` — production-truth update after implementation is green.

---

### Task 1: Upgrade Renderer Provenance and Add the Bounded Notation Interaction Surface

**Files:**
- Modify: `.github/workflows/ci.yml`
- Regenerate: `vendor/st-score-runtime/**`
- Modify: `src/practice/notationAdapter.js`
- Modify: `test/notationAdapter.test.js`
- Test/verify: existing renderer-runtime CI path

**Interfaces:**
- Consumes: renderer browser runtime at exact SHA `13aa0843158257a207afe062879743d58048cc6d`.
- Produces:
  - `notationAdapter.render({ musicXml, sourceId }) -> Promise<{ capability, evidence }>`
  - successful `evidence -> { sourceId: string, renderEpoch: string }`
  - `notationAdapter.hitTestMeasureDetailed({ clientX, clientY }) -> result | null`
  - `notationAdapter.moveCursor({ partId, measureIndex }) -> Promise<boolean>`
  - `notationAdapter.highlight(target) -> Promise<boolean>`, where `target` is a renderer `ScoreNoteRef`
  - `notationAdapter.clearHighlights() -> Promise<boolean>`
  - existing `isAvailable()` and `dispose()` semantics remain.

- [ ] **Step 1: Write failing notation-adapter tests for exact render evidence and additive interaction feature detection**

Add tests asserting:
- `render({ musicXml, sourceId: "pkg-a" })` passes bounded sourceId to runtime and returns `{ sourceId: "pkg-a", renderEpoch: "render-1" }` from the successful runtime result.
- missing `hitTestMeasureDetailed`, `moveCursor`, `highlight`, or `clearHighlights` never breaks ordinary rendering and returns the adapter's bounded unavailable result.
- runtime exceptions from interaction methods are swallowed at the Student boundary and produce `null`/`false`.
- a replacement render returns a new epoch and old evidence is not retained.
- non-finite hit coordinates are rejected before or by the runtime and remain bounded.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:
```bash
node --test test/notationAdapter.test.js
```

Expected: FAIL because `sourceId`, render evidence, and interaction methods do not exist yet.

- [ ] **Step 3: Upgrade the exact renderer runtime and implement the minimal adapter bridge**

Update both `RENDERER_SHA` occurrences in CI to:
`13aa0843158257a207afe062879743d58048cc6d`.

Regenerate the committed runtime only through the renderer's canonical command:

```bash
ST_SCORE_RENDERER_SOURCE_REVISION=13aa0843158257a207afe062879743d58048cc6d   node scripts/export-browser-runtime.mjs browser-runtime
```

Copy the resulting browser-runtime contents into `vendor/st-score-runtime`; do not hand-patch generated files.

Implement the Task 1 adapter interfaces without exposing DOM, SVG, OSMD, raw runtime objects, or runtime errors.

- [ ] **Step 4: Verify GREEN and runtime provenance**

Run:
```bash
node --test test/notationAdapter.test.js
node -e 'const m=require("./vendor/st-score-runtime/runtime-manifest.json"); if(m.rendererSourceRevision!=="13aa0843158257a207afe062879743d58048cc6d" || m.scoreRendererContractVersion!=="0.2.0" || m.runtimeTarget!=="browser") process.exit(1)'
git diff --check
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add .github/workflows/ci.yml vendor/st-score-runtime src/practice/notationAdapter.js test/notationAdapter.test.js
git commit -m "feat: upgrade student renderer interaction runtime"
```

---

### Task 2: Add Playback Timing Provenance Without Changing PlaybackPlan Schema

**Files:**
- Modify: `src/playback/playbackPlanResolver.js`
- Modify: `test/playbackPlanResolver.test.js`

**Interfaces:**
- Consumes: existing `trustedTimingProvider.resolveTrustedPlan(pkg)` and existing approximate compiler.
- Produces:
  - existing `resolvePackage(pkg) -> PlaybackPlan | null` remains backward compatible.
  - new `resolvePackageContext(pkg) -> { plan, timingProvenance } | null`.
  - internal `timingProvenance` is either:
    - `{ kind: "EXACT_SCORE_SOURCE", musicXml: string }`, or
    - `null`.
  - optional trusted-provider seam:
    - `trustedTimingProvider.resolveTrustedProvenance(pkg, plan) -> { kind: "EXACT_SCORE_SOURCE", musicXml: string } | null`.
  - trusted provenance is accepted only when the returned MusicXML is exactly equal to `pkg.content.score.data`.
  - raw MusicXML provenance remains internal and must never be logged/rendered.

- [ ] **Step 1: Write failing provenance tests**

Add tests asserting:
- approximate compilation from the exact package SCORE returns a context whose `timingProvenance.kind === "EXACT_SCORE_SOURCE"` and whose source equals the exact package SCORE input.
- a valid trusted FULL plan with no `resolveTrustedProvenance` remains playable but returns `timingProvenance: null`.
- packageId equality and FULL quality do not create provenance.
- a trusted provenance payload whose MusicXML differs from the package SCORE is rejected to `null`.
- an exact trusted provenance payload is accepted.
- `resolvePackage(pkg)` still returns the same normalized plan as before.

- [ ] **Step 2: Run focused resolver tests and confirm RED**

Run:
```bash
node --test test/playbackPlanResolver.test.js
```

Expected: FAIL because `resolvePackageContext` and provenance handling do not exist.

- [ ] **Step 3: Implement `resolvePackageContext` and preserve `resolvePackage`**

Do not alter `PlaybackPlan` validation/schema. Do not add renderer refs or provenance fields to public plans.

- [ ] **Step 4: Verify GREEN**

Run:
```bash
node --test test/playbackPlanResolver.test.js
node --test test/playbackPlan.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/playback/playbackPlanResolver.js test/playbackPlanResolver.test.js
git commit -m "feat: add score timing provenance context"
```

---

### Task 3: Build the Source-Derived ScoreFollowIndex

**Files:**
- Create: `src/practice/scoreFollowIndex.js`
- Create: `test/scoreFollowIndex.test.js`
- Reuse: `src/playback/musicXmlPlaybackDom.js`

**Interfaces:**
- Consumes:
  - `createScoreFollowIndex({ packageId, sourceId, musicXml, playbackContext, parser })`
  - `playbackContext -> { plan, timingProvenance }`.
- Produces immutable index:
  - `packageId`
  - `sourceId`
  - `measureMapping: "EXACT" | "UNAVAILABLE"`
  - `eventMapping: "EXACT" | "UNAVAILABLE"`
  - `resolveMeasureHit({ partId, measureIndex }) -> { measureIndex, startBeat, endBeat, cursorTarget } | null`
  - `resolveBeat(beat) -> { measureIndex, cursorTarget, highlightRefs } | null`
  - `highlightRefs` is an immutable array only when `eventMapping === "EXACT"`; otherwise it is `null`.

Renderer ref shape used by the index:
```js
{ partId, measureIndex, noteIndex, voice? }
```

- [ ] **Step 1: Write RED tests for source-derived measure membership**

Tests must prove:
- a part/measure containing only a rest is present in measure membership even though no playable note exists for that part in `PlaybackPlan.notes`.
- tapping that rest-only part resolves to the global PlaybackPlan range; playable notes in another part remain in the same measure playback range.
- a `partId + measureIndex` absent from exact SCORE MusicXML returns `null`.
- invalid/unverifiable source part/measure traversal sets measure mapping unavailable instead of guessing.
- `cursorTarget.partId` is deterministic and source-derived.

- [ ] **Step 2: Write RED tests for event traversal and provenance authority**

Tests must prove:
- renderer counting includes rests but does not emit rest highlight refs.
- same-onset chord members produce multiple exact refs.
- tied visual segments remain separate even when audio notes are merged.
- supported overlapping polyphony produces the exact active ref set.
- ambiguous/unsupported staff/voice traversal sets `eventMapping: "UNAVAILABLE"`.
- valid FULL plan + `timingProvenance: null` yields `eventMapping: "UNAVAILABLE"`.
- exact same-source provenance permits `eventMapping: "EXACT"` only when renderer traversal is also provable.
- FULL/APPROXIMATE labels by themselves do not alter the result.
- no pitch/MIDI/duration/onset-nearness/proximity/DOM/SVG fallback is used.

- [ ] **Step 3: Run focused index tests and confirm RED**

Run:
```bash
node --test test/scoreFollowIndex.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 4: Implement the minimal immutable index**

Parse only exact SCORE MusicXML source semantics needed by the spec. Reuse existing MusicXML DOM helpers rather than creating a second generic XML abstraction. Fail closed for unsupported source shapes.

- [ ] **Step 5: Verify GREEN**

Run:
```bash
node --test test/scoreFollowIndex.test.js
node --test test/musicXmlApproximatePlayback.test.js test/playbackPlanResolver.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/practice/scoreFollowIndex.js test/scoreFollowIndex.test.js
git commit -m "feat: add deterministic score follow index"
```

---

### Task 4: Add Bounded One-Measure Range Playback and Position Observation

**Files:**
- Modify: `src/playback/webAudioPianoEngine.js`
- Modify: `test/webAudioPianoEngine.test.js`

**Interfaces:**
- Produces:
  - existing `play({ plan, tempoBpm })`, `pause()`, `restart()`, tempo/repeat methods unchanged.
  - new `playRange({ plan, tempoBpm, startBeat, endBeat }) -> Promise<void>`.
  - new `subscribePosition(listener) -> unsubscribe`.
  - snapshot: `{ generation: number, beat: number, playing: boolean }`.
- Range mode is independent of existing repeat mode and clears when complete.

- [ ] **Step 1: Write failing range-playback tests**

Assert:
- range starts at exact `startBeat` and stops at exact `endBeat`.
- it never wraps/repeats.
- a note that starts before `startBeat` but remains active is retriggered at range start only for remaining in-range duration.
- every source is clipped at `endBeat`.
- a second range request atomically replaces the first.
- range completion leaves paused/current beat at `endBeat` and clears range mode.
- existing measure-repeat state is not toggled to implement one-shot range playback.

- [ ] **Step 2: Write failing position-subscription tests**

Assert:
- scheduler cadence publishes bounded snapshots.
- pause/restart/range completion publish coherent states.
- dispose increments/invalidates generation and no stale callback mutates later state.
- unsubscribe prevents later delivery.

- [ ] **Step 3: Run focused engine tests and confirm RED**

Run:
```bash
node --test test/webAudioPianoEngine.test.js
```

Expected: FAIL because range/subscription APIs do not exist.

- [ ] **Step 4: Implement range state and scheduler-owned publication**

Do not add `requestAnimationFrame` or a second polling loop. Extend the existing scheduler/beat conversion path.

- [ ] **Step 5: Verify GREEN plus existing playback behavior**

Run:
```bash
node --test test/webAudioPianoEngine.test.js test/studentPlaybackPort.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/playback/webAudioPianoEngine.js test/webAudioPianoEngine.test.js
git commit -m "feat: add one-measure playback range"
```

---

### Task 5: Extend StudentPlaybackPort for Follow Context, Measure Replay, and Package-Scoped Position

**Files:**
- Modify: `src/playback/studentPlaybackPort.js`
- Modify: `test/studentPlaybackPort.test.js`

**Interfaces:**
- Consumes:
  - resolver `resolvePackageContext(pkg)`
  - engine `playRange(...)`
  - engine `subscribePosition(listener)`.
- Produces:
  - `getScoreFollowPlaybackContextForPackage(pkg) -> { plan, timingProvenance } | null`
  - `playMeasureOnceForPackage(pkg, { startBeat, endBeat }) -> Promise<void>`
  - `subscribePositionForPackage(pkg, listener) -> unsubscribe`
  - all existing playback methods remain compatible.

- [ ] **Step 1: Write failing port tests**

Assert:
- the follow context exposes resolver context without adding public PlaybackPlan fields.
- a measure range request activates/switches package ownership the same way ordinary playback does.
- selected tempo is honored for range playback.
- range replay works even when the tapped part itself has no playable note; the port uses only the validated global beat range.
- package A listeners never receive package B engine state after ownership changes.
- stale callbacks after `disposePackage` are ignored.
- engine failures become bounded Student playback errors.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:
```bash
node --test test/studentPlaybackPort.test.js
```

Expected: FAIL for missing methods.

- [ ] **Step 3: Implement using context cache rather than duplicating plan/provenance resolution**

Keep existing `resolvePackage` behavior visible to legacy callers. No UI/canonical authority is added.

- [ ] **Step 4: Verify GREEN**

Run:
```bash
node --test test/studentPlaybackPort.test.js test/playbackPlanResolver.test.js test/webAudioPianoEngine.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/playback/studentPlaybackPort.js test/studentPlaybackPort.test.js
git commit -m "feat: expose bounded score follow playback"
```

---

### Task 6: Add ScoreFollowCoordinator and Stale-Evidence Protection

**Files:**
- Create: `src/practice/scoreFollowCoordinator.js`
- Create: `test/scoreFollowCoordinator.test.js`

**Interfaces:**
- Constructor:
  - `createScoreFollowCoordinator({ notationAdapter, playbackPort, createIndex = createScoreFollowIndex })`.
- Produces:
  - `bind({ pkg, sourceId, musicXml, renderEvidence }) -> boolean`
  - `handlePoint({ clientX, clientY }) -> Promise<boolean>`
  - `clear() -> Promise<void>`
  - `dispose() -> Promise<void>`.

Binding requirements:
- follow is bindable only when `sourceId === pkg.packageId` (SCORE source).
- build index from `playbackPort.getScoreFollowPlaybackContextForPackage(pkg)`.
- retain `packageId + sourceId + renderEpoch + follow generation`.
- subscribe once to package position and unsubscribe on clear/rebind.

- [ ] **Step 1: Write failing tap/replay tests**

Assert:
- fresh renderer HIT with matching `sourceId + renderEpoch` resolves through index and calls `playMeasureOnceForPackage` once.
- MISS does nothing.
- unknown source part/measure does nothing.
- a HIT from an old render epoch does nothing.
- a HIT whose sourceId differs from the current SCORE source does nothing.
- finite client coordinates are forwarded unchanged; no scroll/devicePixelRatio adjustment is added.

- [ ] **Step 2: Write failing cursor/highlight tests**

Assert:
- active measure change calls `moveCursor` once; same measure does not repeat calls.
- exact active ref-set change clears old highlights then applies each exact current ref.
- unchanged sorted ref set does not re-highlight.
- `eventMapping: "UNAVAILABLE"` never calls highlight but still moves measure cursor.
- renderer cursor/highlight failure does not stop audio or throw through the coordinator.
- rebind/clear while an old position callback is in flight rejects the stale generation.

- [ ] **Step 3: Run focused coordinator tests and confirm RED**

Run:
```bash
node --test test/scoreFollowCoordinator.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 4: Implement generation-bound orchestration**

Do not query DOM/SVG or derive score identity in the coordinator. It may only consume adapter hit evidence, the immutable index, and playback snapshots.

- [ ] **Step 5: Verify GREEN**

Run:
```bash
node --test test/scoreFollowCoordinator.test.js test/scoreFollowIndex.test.js test/notationAdapter.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/practice/scoreFollowCoordinator.js test/scoreFollowCoordinator.test.js
git commit -m "feat: coordinate interactive score follow"
```

---

### Task 7: Wire SCORE-Only Follow into the Existing Piece/Notation Lifecycle

**Files:**
- Modify: `src/ui/studentAppController.js`
- Modify: `src/ui/mountStudentApp.js`
- Modify: `src/ui/main.js`
- Modify: `test/studentPieceWorkspaceController.test.js`
- Modify: `test/studentPieceWorkspaceMount.test.js`
- Modify: `test/practiceNotationLifecycle.test.js` as needed
- Do not modify `src/ui/renderPieceWorkspace.js` unless a test proves the persistent score root lacks an existing safe hit ownership seam.

**Interfaces:**
- Controller adds internal-only:
  - `getScoreFollowSource() -> { pkg, sourceId, musicXml } | null`.
- It returns non-null only for the currently selected SCORE source; TAB and CHORDS return null.
- Mount composes render success with `scoreFollowCoordinator.bind(...)`; it clears before replacement/dispose/view/session changes.
- A click owned by an existing `data-action` is never routed to score follow.
- A non-control click is routed only when its target is inside the live persistent `#st-score-root`.

- [ ] **Step 1: Write failing controller tests**

Assert:
- SCORE returns exact package + SCORE source id/musicXml.
- TAB returns null for follow even though `getPracticeRenderSource()` returns TAB MusicXML.
- CHORDS, sign-out, back, failed piece, and session replacement return null.
- no new action dispatcher command exposes package/source internals to student UI.

- [ ] **Step 2: Write failing mount lifecycle/tap tests**

Assert:
- successful SCORE render binds with the adapter's current render evidence.
- replacement render clears old follow binding before rebinding.
- SCORE → TAB clears follow and never reuses SCORE identity.
- TAB → CHORDS → SCORE binds only after the new SCORE render succeeds.
- existing `data-action` controls never become score taps.
- score-root whitespace click forwards the fresh `clientX/clientY`.
- sign-out/destroy disposes coordinator and preserves existing notation/playback teardown rules.
- score follow position updates do not trigger full Student UI paint on every scheduler tick.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:
```bash
node --test test/studentPieceWorkspaceController.test.js test/studentPieceWorkspaceMount.test.js test/practiceNotationLifecycle.test.js
```

Expected: FAIL for missing follow source/coordinator wiring.

- [ ] **Step 4: Implement minimal composition**

Create the coordinator in `src/ui/main.js` from the same notation adapter and playback port already used by the app. Keep raw package/MusicXML away from rendered HTML and accessibility strings.

- [ ] **Step 5: Verify GREEN and regress existing Piece/TAB behavior**

Run:
```bash
node --test test/studentPieceWorkspaceController.test.js test/studentPieceWorkspaceMount.test.js test/practiceNotationLifecycle.test.js
node --test test/studentPlaybackLifecycle.test.js test/student08Focus.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/ui/studentAppController.js src/ui/mountStudentApp.js src/ui/main.js test/studentPieceWorkspaceController.test.js test/studentPieceWorkspaceMount.test.js test/practiceNotationLifecycle.test.js test/studentPlaybackLifecycle.test.js test/student08Focus.test.js
git commit -m "feat: bind score follow to piece lifecycle"
```

---

### Task 8: Make the Feature Offline-Safe and Prove It in Real Chromium/WebKit

**Files:**
- Modify: `service-worker.js`
- Create: `browser-tests/interactive-score-follow.spec.mjs`
- Modify only if needed: browser support fixtures under `browser-tests/support/**`
- Verify: existing `browser-tests/full-student-journey.spec.mjs`
- Verify: existing `browser-tests/pilot-tab.spec.mjs`

**Interfaces:**
- Service worker cache name becomes exactly `st-student-shell-v17`.
- Cache adds:
  - `./src/practice/scoreFollowIndex.js`
  - `./src/practice/scoreFollowCoordinator.js`
- Existing renderer runtime assets remain cached locally.
- No new network dependency is introduced for follow.

- [ ] **Step 1: Write failing browser evidence for SCORE interactions**

At 320px viewport, real pinned renderer runtime must prove:
- notehead point → correct containing measure one-shot replay request.
- rest point → correct containing measure replay.
- true measure whitespace → correct measure replay.
- outside measure → no replay.
- scroll later measure into view, use fresh client coordinates, then correct measure replay.
- automatic measure cursor changes with playback.
- exact supported note/chord highlight changes with playback.
- a fixture with unsupported event provenance still moves cursor/replays measure but does not highlight.

- [ ] **Step 2: Add lifecycle/offline browser cases**

Prove:
- SCORE → TAB → CHORDS → SCORE preserves root/navigation and TAB never gets SCORE follow binding.
- warm cache, go offline, reload, open SCORE, and the new runtime/follow modules load without a renderer network request.
- no duplicate audio, stuck highlight, or detached `#st-score-root`.

- [ ] **Step 3: Update service-worker v17 and shell assets**

Do not change offline authorization/data ownership.

- [ ] **Step 4: Run both engines locally**

Run:
```bash
ST_BROWSER=chromium node --test browser-tests/interactive-score-follow.spec.mjs
ST_BROWSER=webkit node --test browser-tests/interactive-score-follow.spec.mjs
ST_BROWSER=chromium npm run test:browser
ST_BROWSER=webkit npm run test:browser
```

Expected: PASS in both engines.

- [ ] **Step 5: Commit Task 8**

```bash
git add service-worker.js browser-tests
git commit -m "test: prove interactive score follow in browsers"
```

---

### Task 9: Full Regression, Documentation, Exact-Head CI and Sonar Gate — Stop Before Merge

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/progress/2026-09-27-student-09-interactive-score-follow-progress.md` if the repository execution convention uses a progress ledger.
- No deployment files/services.

**Interfaces:**
- No new production API.
- Produces exact-head evidence bundle for Human Merge Gate.

- [ ] **Step 1: Update production-truth docs only after Tasks 1–8 are green**

Document:
- SCORE-only measure tap replay.
- automatic measure cursor.
- provenance-gated exact note/chord highlight.
- TAB fail-closed identity boundary.
- renderer SHA `13aa0843158257a207afe062879743d58048cc6d`.
- offline cache `v17`.
- no student edit authority.
- no new Render service/domain.

- [ ] **Step 2: Run the full local/unit regression**

Run:
```bash
npm test
git diff --check
```

Expected: 0 failures and no whitespace errors.

- [ ] **Step 3: Run full Chromium + WebKit browser regression**

Run:
```bash
ST_BROWSER=chromium npm run test:browser
ST_BROWSER=webkit npm run test:browser
```

Expected: PASS.

- [ ] **Step 4: Perform Guardrails whole-branch review against the approved spec**

Verify every spec acceptance criterion maps to:
- one exact implementation surface;
- one fresh executable test/evidence item;
- no unrelated Secure Delivery/Chord Board/Teacher/OMR/editor/Render changes;
- no secrets/raw MusicXML/debug identity in logs or rendered UI.

- [ ] **Step 5: Commit docs/evidence**

```bash
git add README.md docs/architecture.md docs/superpowers/progress
git commit -m "docs: record STUDENT-09 production behavior"
```

- [ ] **Step 6: Open or update a draft PR to obtain exact-head remote evidence**

The PR remains **draft/open**. Do not merge.

The draft PR is required because current Student CI triggers on `pull_request`, while this SES-27 branch name is not covered by the current push filter (`main`, `feat/**`). It also gives SonarQube Cloud a PR analysis surface.

Record exact head SHA before waiting for checks.

- [ ] **Step 7: Require exact-head GitHub Actions and SonarQube Cloud**

For that exact head require:
- `test`: PASS.
- `renderer-runtime`: PASS and manifest renderer SHA exact.
- `tab-browser (chromium)`: PASS.
- `tab-browser (webkit)`: PASS.
- `SonarCloud Code Analysis`: completed successfully with **Quality Gate passed**.

Do not use an earlier commit's Sonar result as final evidence.

- [ ] **Step 8: Hand back and stop at Human Merge Gate**

Report exactly:

```text
COMPLETED: SES-27 STUDENT-09 implementation
RESULT: PASS / PARTIAL / BLOCKED
SPEC: docs/superpowers/specs/2026-09-27-student-09-interactive-score-follow-design.md
PLAN: docs/superpowers/plans/2026-09-27-student-09-interactive-score-follow.md
BASELINE: ced3f4366ffccf42bc82aa70d0bcb3cef770621e
PR: <draft PR number + URL>
EXACT_HEAD: <sha>
RENDERER_REVISION: 13aa0843158257a207afe062879743d58048cc6d
UNIT_TESTS: <result>
CHROMIUM: <result>
WEBKIT: <result>
SONAR_QUALITY_GATE: <result>
OFFLINE: <result>
PRODUCTION_CODE_CHANGED: YES
MERGED: NO
DEPLOYED: NO
PERMANENT_STUDENT_URL: https://st-student-app.onrender.com
NEW_RENDER_URL_OR_SERVICE: NO
PHYSICAL_IPHONE_SAFARI: NOT RUN
BLOCKERS: <none or exact blocker>
NEXT: Human Merge Gate
NEXT START CONDITION: explicit human merge approval after exact-head PASS
```

Do not merge. Do not deploy. Do not perform physical-device acceptance yet.

---

## Post-Merge / Deploy Gates — Not Authorized by This Plan Approval

After a separate **Human Merge Gate**:
1. merge only the approved exact head;
2. verify post-merge exact `main` CI and SonarQube Cloud;
3. stop at **Human Deploy Gate**.

After a separate **Human Deploy Gate**:
1. update only the existing `https://st-student-app.onrender.com` deployment;
2. do not create a new service/domain;
3. perform the spec's physical iPhone/Safari acceptance;
4. only after physical PASS may SES-27 be marked Done and SES-28 considered.

## Self-Review Result

- **Spec coverage:** all design sections map to Tasks 1–9; the two Notion technical blockers are explicit in Tasks 2–3.
- **Type consistency:** adapter evidence, playback context, ScoreFollowIndex, coordinator, controller/mount seams use one consistent naming chain.
- **Review Focus:** all five high-risk cases have named executable tests.
- **Authority separation:** measure mapping and event-highlight provenance are separate; TAB never reuses SCORE identity.
- **TDD:** every production change begins with a focused RED check and ends with GREEN verification before commit.
- **Remote evidence:** current branch push filter limitation is handled by a draft PR; exact-head Sonar is required, not inferred from current main.
- **Human gates:** implementation plan approval does not authorize merge or deploy.
- **Proportion:** plan specifies interfaces, tests, commands, and gates without embedding implementation bodies.
