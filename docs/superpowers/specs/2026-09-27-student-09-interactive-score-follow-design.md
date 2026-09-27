# STUDENT-09 Interactive Score Follow V1 — Design Spec

**Linear:** SES-27  
**Repository:** `khfy7wpr5p-maker/st-student-app`  
**Baseline main:** `ced3f4366ffccf42bc82aa70d0bcb3cef770621e`  
**Renderer prerequisite:** `khfy7wpr5p-maker/st-score-rendering-layer@13aa0843158257a207afe062879743d58048cc6d`  
**Status:** WRITTEN — AWAITING HUMAN SPEC APPROVAL

## 1. Goal

STUDENT-09 adds read-only score following to the Student App SCORE view:

1. tapping anywhere inside a rendered measure plays that measure exactly once;
2. playback moves the renderer cursor automatically to the active measure;
3. playback highlights the exact currently active rendered note or chord when deterministic renderer identity is provable;
4. existing SCORE, TAB, Chords, playback, offline, authorization, and persistent notation-root behavior remain intact.

The feature is consumer-owned. The renderer remains presentation-only.

## 2. Approved intent and invariants

The student is practicing from an immutable Practice Package. STUDENT-09 must improve navigation and visual following without creating edit authority or changing teacher/canonical content.

Hard invariants:

- no student score editor;
- no OMR;
- no microphone/MIDI performance scoring;
- no teacher canonical mutation;
- no pitch, duration, visual-distance, nearest-note, or nearest-measure identity guessing;
- no consumer SVG/OSMD scraping;
- no renderer-owned playback;
- no new Render service, domain, or Student URL;
- permanent Student URL remains `https://st-student-app.onrender.com`;
- existing Secure Delivery authority and offline ownership remain unchanged.

## 3. Fresh baseline facts

At the approved design baseline:

- Student `main` is `ced3f4366ffccf42bc82aa70d0bcb3cef770621e`;
- no SES-27 Student branch or PR existed before this design branch;
- Student CI and committed runtime still pin renderer `375cb5f134a91606eeac59df9cbe33dedbe57e47`;
- committed `vendor/st-score-runtime/runtime-manifest.json` reports that same old renderer revision;
- Student renderer contract remains `0.2.0`;
- current service-worker cache is `st-student-shell-v16`;
- current `PlaybackPlan` already carries `partId`, `measureIndex`, beats, measure ranges, tempo information, and playable notes;
- the Web Audio engine already owns beat/time conversion, scheduler lifecycle, pause/restart, tempo changes, and measure-repeat state;
- `#st-score-root` is persistent across SCORE/TAB/CHORDS repaint rules and must remain persistent.

The renderer prerequisite now provides additive, revision-specific runtime methods:

- `hitTestMeasureDetailed({ clientX, clientY })`;
- `hitTestRenderedEventDetailed({ clientX, clientY })`;
- `moveCursor({ partId, measureIndex })`;
- `highlight({ target })`;
- `clearHighlights()`.

These remain additive extensions under contract `0.2.0`; Student App must pin exact renderer provenance and feature-detect them.

## 4. Architecture

The design has four explicit ownership layers:

```text
MusicXML + validated PlaybackPlan
          |
          v
Student-owned ScoreFollowIndex
          |
          +------------------+
          |                  |
          v                  v
measure replay          playback position
          |                  |
          v                  v
StudentPlaybackPort     ScoreFollowCoordinator
                             |
                             v
                    ST notation adapter
                             |
                             v
              renderer presentation APIs
```

Responsibilities:

- **ScoreFollowIndex**: immutable Student-owned mapping from score/playback timing to renderer presentation locators.
- **StudentPlaybackPort / WebAudio engine**: audio timing, one-measure range playback, and bounded position snapshots.
- **ScoreFollowCoordinator**: current-render binding, tap handling, stale-evidence rejection, cursor/highlight de-duplication, lifecycle cleanup.
- **Notation adapter**: exact runtime bridge only; it does not infer score identity or playback meaning.

## 5. Renderer provenance upgrade

STUDENT-09 must upgrade both CI and committed runtime provenance from the old renderer to:

`13aa0843158257a207afe062879743d58048cc6d`

Required consequences:

- `.github/workflows/ci.yml` pins that exact SHA;
- the committed `vendor/st-score-runtime` is regenerated only through the canonical renderer export path;
- runtime manifest digests and `rendererSourceRevision` match the exact SHA;
- `ci/renderer-package-lock.json` remains dependency-compatible and is changed only if the exact renderer build requires it;
- renderer contract stays `0.2.0`;
- service-worker shell cache advances exactly once from baseline `v16` to `v17` so existing installed Students cannot retain the old interaction runtime;
- offline runtime tests verify the new interaction methods are available after an online install/cache cycle.

No runtime file may be hand-patched.

## 6. Notation adapter boundary

`createStNotationAdapter()` remains the only Student-side renderer boundary.

The adapter will extend its bounded surface to support:

- render with the current `sourceId`;
- preservation of the successful renderer `renderEpoch` and returned bounded `sourceId`;
- `hitTestMeasureDetailed(point)`;
- `hitTestRenderedEventDetailed(point)`;
- `moveCursor(target)`;
- `highlight(target)`;
- `clearHighlights()`.

The adapter must feature-detect every additive method. Missing methods fail closed for STUDENT-09 while ordinary notation rendering remains usable.

A successful render result is presentation evidence, not canonical identity. Old evidence becomes stale after replacement render, disposal, render failure, or source change.

The adapter must not expose DOM nodes, SVG, OSMD objects, renderer internals, MusicXML text, or debug payloads.

## 7. ScoreFollowIndex

### 7.1 Purpose

`ScoreFollowIndex` is an immutable, package-bound, source-bound Student data structure. It maps:

- renderer measure identity → playback range;
- playback beat → active measure;
- playback beat → exact rendered note/chord refs when provable.

Conceptual shape:

```js
{
  schemaVersion: 1,
  packageId,
  sourceId,
  measures: [
    {
      measureIndex,
      startBeat,
      endBeat,
      partIds,
      cursorPartId
    }
  ],
  events: [
    {
      startBeat,
      endBeat,
      measureIndex,
      refs: [ScoreNoteRef, ...]
    }
  ],
  eventMapping: "EXACT" | "UNAVAILABLE"
}
```

The concrete implementation may optimize internal storage, but these semantics are fixed.

### 7.2 Source binding

V1 full score-follow authority is bound to the exact SCORE render source used to build the index.

For the normal Practice Package this is the SCORE `sourceId`, not the generated TAB `sourceId`.

If current renderer evidence reports a different `sourceId`, the coordinator must not reuse the index.

Therefore:

- SCORE may use measure replay, cursor, and exact event highlight when its binding is current;
- TAB keeps all existing rendering/playback/navigation behavior;
- V1 does **not** assume generated TAB MusicXML has identical renderer event identity;
- on TAB or any unmatched source, follow operations fail closed rather than guessing.

This is a deliberate V1 safety boundary, not a TAB regression.

### 7.3 Measure mapping

Measure replay uses validated `PlaybackPlan.measures`.

A renderer measure HIT `{ partId, measureIndex }` is accepted only if:

- the current package/source/render epoch binding is current;
- the index has that `measureIndex`;
- the hit `partId` is one of the index's part IDs for that measure.

The replay range is the global measure range `[startBeat, endBeat)`; all playable parts whose onsets belong to that measure are heard. The tapped part is not treated as a solo request.

`cursorPartId` is deterministic and source-derived. No “closest visible part” or DOM heuristic is allowed.

### 7.4 Exact rendered event mapping

Precise highlight does not match by pitch, MIDI, duration, geometry, or nearest onset.

The event compiler mirrors the pinned renderer's documented `ScoreNoteRef` counting policy from the same MusicXML source:

- identity is scoped by `partId + measureIndex`;
- when a usable non-negative voice is present, locator index is counted within that voice;
- rests participate in renderer traversal counting even though they are not highlight targets;
- chord members each occupy their deterministic renderer event position;
- when voice identity is unavailable, only a source shape whose unfiltered traversal can be proven equivalent is accepted;
- unsupported or ambiguous staff/voice traversal produces `eventMapping: "UNAVAILABLE"`.

Initial V1 exact-highlight support must fail closed for score structures whose renderer ordering cannot be proven from source semantics, including ambiguous multi-staff/voice cases.

Measure replay and measure cursor remain allowed when measure mapping is valid even if event highlight is unavailable.

### 7.5 Ties and visual segments

Audio playback may merge tied notes, but visual follow must preserve rendered note segments.

The follow compiler therefore keeps source/rendered segments separately from merged audio notes. A tied continuation may highlight the notehead in its current rendered measure even though the audio `PlaybackPlan` represents the tie as one sustained logical note.

This separation prevents audio normalization from corrupting renderer identity.

### 7.6 Chords and overlapping notes

At a playback beat, the active highlight set is every exact `ScoreNoteRef` whose source-derived visual segment is active at that beat.

This naturally highlights:

- all members of a chord beginning together;
- sustained chord members while they remain active;
- overlapping polyphonic notes when exact identity is supported.

The coordinator updates renderer highlight only when the sorted active ref set changes.

## 8. One-measure playback

### 8.1 Public Student behavior

A tap on any true renderer-owned point inside a measure:

```text
click/tap fresh client coordinates
→ notationAdapter.hitTestMeasureDetailed()
→ current renderEpoch/sourceId validation
→ ScoreFollowIndex measure validation
→ StudentPlaybackPort.playMeasureOnceForPackage()
```

Renderer MISS remains MISS. The Student App must not replace it with a nearest-measure fallback.

### 8.2 Playback engine semantics

The Web Audio engine gains a bounded range-playback operation.

For a selected measure:

- playback starts at that measure's `startBeat`;
- playback ends at that measure's `endBeat`;
- the range plays exactly once;
- it does not enable or depend on the existing repeat toggle;
- tapping another measure while playback is active atomically replaces the active range;
- scheduled notes are clipped at the range end;
- a logical note that began before `startBeat` but remains active inside the selected measure is retriggered at `startBeat` for only its remaining in-range duration;
- after range completion, range mode clears and playback position remains at the range end;
- ordinary Play/Pause/Restart and user-controlled measure-repeat behavior continue to work independently.

No synthetic tempo or timing data is introduced.

## 9. Playback position observation

The Web Audio engine already computes the current beat. STUDENT-09 exposes this through a bounded subscription instead of UI polling or repainting application state.

A position snapshot contains only presentation/playback data needed by follow logic, conceptually:

```js
{
  generation,
  beat,
  playing
}
```

The StudentPlaybackPort binds snapshots to the active package and hides engine internals.

Requirements:

- snapshots are emitted from the existing scheduler cadence; no new animation loop is required;
- stale callbacks from an old package/generation are ignored;
- pause, restart, range completion, package replacement, and dispose publish/terminate state consistently;
- follow updates never force the main Student UI to re-render every scheduler tick.

## 10. ScoreFollowCoordinator

The coordinator is presentation orchestration only. It does not own canonical score data or app navigation.

It binds:

- current Practice Package;
- current SCORE sourceId;
- current renderer renderEpoch;
- current ScoreFollowIndex;
- current playback-position subscription.

### Tap handling

The existing Student root event ownership remains consumer-side. A click/tap not owned by a `data-action` control may be treated as a score tap only when it belongs to the live persistent notation root.

Fresh `event.clientX/clientY` are passed unchanged.

No manual scroll offset, devicePixelRatio correction, cached rectangle, or SVG query is permitted.

### Cursor handling

On position update:

- resolve active measure from the index;
- call `moveCursor({ partId: cursorPartId, measureIndex })` only when the active measure changes;
- renderer failure is bounded to follow presentation and must not stop audio.

### Highlight handling

When `eventMapping === "EXACT"`:

- compute current active ref set;
- if the set differs from the previous set, clear old highlights and apply the exact current refs;
- zero active refs means clear highlights;
- an individual highlight failure fails closed for highlight state and must not mutate audio or score data.

When `eventMapping === "UNAVAILABLE"`, no note/chord highlight is attempted.

## 11. Render/lifecycle freshness

Every score-follow operation requires one current binding:

`packageId + sourceId + renderEpoch + follow generation`

The following invalidate the binding immediately:

- replacement render;
- SCORE → TAB;
- SCORE/TAB → CHORDS;
- opening another Piece/Practice;
- sign-out/session replacement;
- notation render failure;
- notation dispose;
- coordinator destroy.

On invalidation:

- playback may be paused only where existing navigation policy already requires it;
- cursor/highlights are cleared best-effort;
- old hit evidence and old callbacks are ignored;
- the persistent `#st-score-root` ownership rules remain unchanged.

Returning CHORDS → SCORE may rebind only after a current successful SCORE render.

## 12. UI and accessibility behavior

STUDENT-09 adds no new mandatory visible control for measure replay. The score itself is the tap target.

Existing Play/Pause/Restart/tempo/repeat controls remain unchanged.

Requirements:

- no new text clutter around the score;
- no hidden score contents, pitches, MusicXML, package IDs, source IDs, renderer epochs, or debug strings are announced through VoiceOver;
- existing keyboard/button accessibility remains unchanged;
- score tap behavior must not intercept existing `data-action` controls.

A future keyboard-specific measure navigation feature is outside V1.

## 13. Offline behavior

After one successful online installation/update:

- the exact SES-38 renderer runtime must be available from the Student shell cache;
- `ScoreFollowIndex` compiler and coordinator modules must be shell-cached;
- measure replay and follow must use local Practice Package/PlaybackPlan data and local renderer/audio assets;
- no renderer network request is introduced;
- existing authorization/offline repository rules remain authoritative.

The service-worker version bump is required so an installed device cannot silently mix new Student code with the old renderer runtime.

## 14. Error handling and fail-closed policy

Follow failures are presentation/playback-local.

Examples:

- renderer measure MISS → no replay;
- stale renderEpoch/sourceId → no replay/cursor/highlight;
- unsupported exact event mapping → measure follow allowed, note highlight disabled;
- renderer cursor/highlight error → audio continues;
- measure replay engine error → existing playback capability error handling applies;
- malformed/non-finite point → rejected at the adapter/runtime boundary;
- source mismatch → follow disabled for that render.

The system must not silently fall back to pitch, MIDI, duration, DOM ancestry, SVG selectors, nearest geometry, or arbitrary hit radius.

## 15. Privacy and diagnostics

No STUDENT-09 diagnostic path may log or render:

- raw MusicXML;
- SVG;
- pitches/MIDI;
- lyrics;
- raw package/source IDs;
- renderEpoch values;
- Firebase/provider identity;
- tokens or credentials.

If diagnostic counters are added, they may identify only bounded stages such as:

- measure_hit;
- measure_miss;
- stale_binding;
- follow_index_unavailable;
- cursor_failure;
- highlight_failure;
- replay_failure.

Diagnostics are not required for V1 completion unless an existing test/debug boundary already uses them.

## 16. Compatibility/version decision

No renderer base-contract bump is required.

Student continues to declare renderer contract `0.2.0`, while exact runtime provenance is upgraded and verified.

`PlaybackPlan.schemaVersion` remains `1`. Renderer locator data is **not** added to the public PlaybackPlan note schema. ScoreFollowIndex is a separate Student-owned derived structure.

This avoids turning presentation identity into playback/canonical identity.

## 17. Required implementation surfaces

Expected focused production surfaces:

- `src/practice/notationAdapter.js`;
- new `src/practice/scoreFollowIndex.js`;
- new `src/practice/scoreFollowCoordinator.js`;
- `src/playback/studentPlaybackPort.js`;
- `src/playback/webAudioPianoEngine.js`;
- only the minimum controller/mount/main wiring necessary to bind the current SCORE package/source;
- `service-worker.js`;
- exact regenerated `vendor/st-score-runtime/**`;
- `.github/workflows/ci.yml`;
- documentation/tests corresponding to these changes.

Unrelated Secure Delivery, Chord Board, Teacher, OMR, editor, TAB generation, or Render backend code must not change.

## 18. Acceptance tests

### ScoreFollowIndex unit acceptance

Must prove:

1. measure lookup maps exact `partId + measureIndex` to the validated PlaybackPlan range;
2. a part mismatch fails closed;
3. beat lookup moves deterministically across measure boundaries;
4. exact single-note refs follow renderer counting policy;
5. rests consume locator positions without becoming highlight refs;
6. chord members become one active highlight set;
7. ties remain separate visual segments;
8. overlapping exact notes produce the correct active ref set;
9. ambiguous/unsupported multi-staff traversal returns `eventMapping: "UNAVAILABLE"`;
10. no pitch/duration/proximity fallback exists;
11. sourceId/package mismatch cannot reuse an index.

### Playback unit acceptance

Must prove:

1. selected measure begins at exact `startBeat`;
2. range ends at exact `endBeat` and does not wrap;
3. crossing notes are clipped at the measure end;
4. notes active before range start are retriggered only for their remaining in-range duration;
5. tapping a second measure replaces the first range;
6. existing full play/pause/restart/tempo/repeat tests remain green;
7. position subscription publishes current beat and terminates cleanly on dispose/package replacement.

### Notation/coordinator unit acceptance

Must prove:

1. render passes bounded sourceId and records current renderEpoch evidence;
2. missing additive runtime methods fail closed without breaking basic notation;
3. fresh measure HIT triggers exactly one measure replay;
4. MISS triggers no replay;
5. stale epoch/source binding triggers no replay;
6. post-scroll fresh coordinates are forwarded unchanged;
7. cursor moves only when measure changes;
8. highlight updates only when exact active ref set changes;
9. unsupported event mapping never guesses a highlight;
10. rerender/view change/sign-out clears stale follow presentation;
11. `#st-score-root` remains persistent under existing Piece lifecycle rules.

### Browser/engine acceptance

Chromium and pinned Playwright WebKit must prove, using the exact regenerated renderer runtime:

- 320px SCORE view;
- real measure whitespace tap → correct measure replay request;
- note/rest point → containing measure replay;
- outside-measure point → no replay;
- scroll then fresh tap → correct measure;
- current cursor advances with playback;
- exact note/chord highlight changes with playback for a supported fixture;
- SCORE → TAB → CHORDS → SCORE preserves existing navigation/root behavior;
- TAB does not reuse SCORE follow identity;
- offline reload after cache warm-up has the new renderer interaction runtime and follow modules;
- no regression in existing full Student journey, TAB browser, playback, VoiceOver/accessibility, and offline suites.

Playwright WebKit is engine evidence, not physical Safari acceptance.

## 19. Physical iPhone/Safari acceptance

SES-27 completion requires a physical iPhone/Safari acceptance after an approved deployment to the existing permanent Student URL.

Minimum physical checks:

- open a Piece SCORE;
- tap notehead, rest, and true measure whitespace;
- each valid tap replays the intended measure once;
- scroll and tap a later measure;
- automatic measure cursor follows playback;
- supported exact note/chord highlight follows playback;
- SCORE → TAB → CHORDS → SCORE still works;
- offline reopen still works after cache warm-up;
- no duplicate audio, stuck highlight, detached score root, or accidental edit behavior.

No new Render URL/service may be created for this acceptance.

## 20. Human gates

This written spec does not authorize implementation.

Required gates:

1. **Human Spec Gate** — explicit approval of this file.
2. After approval, write a detailed implementation plan.
3. **Human Plan Gate** — explicit approval of the written plan and execution method.
4. TDD implementation and exact-head CI/browser verification.
5. **Human Merge Gate** — explicit approval before merge.
6. Post-merge exact-main verification.
7. **Human Deploy Gate** — explicit approval before updating the existing `st-student-app.onrender.com` deployment.
8. Physical iPhone/Safari acceptance.
9. Only then may SES-27 be marked Done.

## 21. Completion report

Final SES-27 completion must report:

```text
COMPLETED: SES-27 — Student App STUDENT-09 Interactive Score Follow V1
RESULT: PASS / PARTIAL / BLOCKED
BASELINE: <starting Student main SHA>
PR: <number + URL>
EXACT_HEAD: <SHA>
RENDERER_REVISION: 13aa0843158257a207afe062879743d58048cc6d
RED_EVIDENCE: <runs>
GREEN_VERIFICATION: <unit/CI/Chromium/WebKit/offline>
MERGED: YES / NO
EXACT_MAIN: <post-merge SHA>
DEPLOYED_EXISTING_URL: YES / NO
PERMANENT_STUDENT_URL: https://st-student-app.onrender.com
NEW_RENDER_URL_OR_SERVICE: NO
PHYSICAL_IPHONE_SAFARI: PASS / NOT RUN / BLOCKED
STUDENT_EDITOR_ADDED: NO
TEACHER_CANONICAL_MUTATION: NO
NOTION: <updated page>
LINEAR: <updated SES-27>
BLOCKERS: <none or exact blocker>
NEXT: SES-28 — Android Chrome / Firefox / iPad Safari compatibility
NEXT START CONDITION: SES-27 exact-main + deployed same URL + physical iPhone PASS + explicit next-stage approval
```
