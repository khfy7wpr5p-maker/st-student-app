# STUDENT-07A progress — Production Notation Runtime Integration

Status: REPOSITORY IMPLEMENTATION GREEN; PHYSICAL NOTATION ACCEPTANCE PASS (2026-09-22)

Base:
- `main`: `06bb110f084dffeb7b72ef93512c7c6db0ea23cf`
- feature branch: `feat/student-07a-notation-runtime-integration`
- PR: #7
- verified code head before this progress note: `24b7176537bc8b1faa4f9adcb57e45c736a80470`

## Implemented scope

- same-origin pinned ST Score Rendering Layer browser runtime
- Rendering Layer source pin `49dcb4737e802f956fc483ab2c8eac62a2508846`
- renderer contract `0.2.0`
- OSMD `2.1.2`
- manifest byte/SHA-256 verification
- Student App runtime loader with bounded READY / UNAVAILABLE / ERROR states
- static import map for generated ST runtime bare module specifiers
- vendor OSMD load before ST module bootstrap
- loader-aware notation adapter
- persistent `#st-score-root` identity for the runtime lifetime
- stale render-generation protection when target availability/presentation changes
- service-worker shell cache v3 with explicit renderer static assets
- private Practice Package storage remains IndexedDB only
- stale Firebase/offline/runtime documentation refreshed

## Integration findings resolved

### Export dependency graph

The generated `browser-bootstrap.mjs` is not standalone. It imports ST packages through bare module specifiers and the OSMD shim expects the generated vendor global. Initial direct bootstrap injection was therefore insufficient.

Regression evidence:
- CI run `35703616173`: RED, including missing local import-map/vendor load behavior.
- fix: static local import map + pinned vendor script load before bootstrap.

### Renderer root lifetime

The exported runtime captures `#st-score-root` at module evaluation. Replacing that DOM node on package/navigation lifecycle would leave the global runtime bound to a detached element.

Regression evidence added for:
- same-Practice repaint;
- package switch;
- leaving and reopening Practice;
- renderer failure/stale queued work.

The mounted Student App now retains the same renderer-root object for the runtime lifetime while continuing to dispose presentation state on lifecycle changes.

## Verification evidence

Colab-generated runtime:
- target: browser
- contract: 0.2.0
- OSMD: 2.1.2
- manifest files: 10
- all manifest byte counts and SHA-256 values verified before commit.

GitHub exact code-head verification:
- commit: `24b7176537bc8b1faa4f9adcb57e45c736a80470`
- CI run: `35704127802`
- tests: 213
- pass: 213
- fail: 0

The suite includes pinned-runtime provenance/hash checks, loader compatibility/single-flight/failure checks, notation adapter isolation, renderer-root lifecycle tests, and service-worker static/private-data boundary checks.

## Scope preserved

No change was made to:
- Practice Package public schema;
- Firebase Security Rules;
- live Firestore data;
- Teacher App;
- Rendering Layer source/public contract;
- playback/timing authority;
- TAB/violin behavior;
- production deployment settings.

Playback remains STUDENT-07B work.

## Physical iPhone / Safari notation acceptance

Physical acceptance was completed on 2026-09-22 against the STUDENT-07A HTTPS preview.

Evidence reported from the iPhone/Safari flow:
1. Firebase-backed `Test Kişisel Çalışma` opened and the Nota region rendered visible score content — PASS.
2. After 10–15 seconds, the notation remained visible and did not disappear — PASS.
3. Portrait/landscape orientation change did not remove the notation — PASS.
4. Ana Sayfa -> reopen the same Practice rendered the notation again — PASS.
5. After the work had been cached online, network-off Safari reload/reopen succeeded and notation remained available offline — PASS.

Temporary GitHub Pages preview deployment run `35704756141` completed successfully. The temporary preview workflow was removed from the feature branch after acceptance.

## Remaining merge gate

The automated repository checks and physical notation acceptance have passed. Playback remains separate STUDENT-07B scope and is not a STUDENT-07A blocker.

PR #7 must remain unmerged until explicit human merge approval is given.
