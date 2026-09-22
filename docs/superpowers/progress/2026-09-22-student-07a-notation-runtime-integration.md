# STUDENT-07A progress — Production Notation Runtime Integration

Status: REPOSITORY IMPLEMENTATION GREEN; PHYSICAL NOTATION ACCEPTANCE PENDING

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

## Remaining merge gate

Repository CI does not prove physical browser rendering. Before merge, STUDENT-07A still requires physical iPhone/Safari/VoiceOver notation acceptance:

1. authorized Practice shows visible notation;
2. VoiceOver exposes the Nota region without raw provider/runtime detail;
3. status/connectivity repaint and orientation/resize do not make the score disappear;
4. leave/reopen or package change does not render into a detached root;
5. after one successful online cache/install cycle, Safari reload can reopen an authorized cached Practice offline with notation available.

PR #7 must remain unmerged until this physical gate passes and explicit human merge approval is given.
