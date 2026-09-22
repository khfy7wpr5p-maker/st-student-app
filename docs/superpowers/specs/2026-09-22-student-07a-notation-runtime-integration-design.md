# STUDENT-07A — Notation Runtime Integration Design

Date: 2026-09-22  
Repository: `khfy7wpr5p-maker/st-student-app`  
Baseline: `main@06bb110f084dffeb7b72ef93512c7c6db0ea23cf`  
Rendering Layer evidence baseline: `khfy7wpr5p-maker/st-score-rendering-layer@49dcb4737e802f956fc483ab2c8eac62a2508846`  
Status: Design approved; implementation not yet authorized.

## 1. Purpose

ST Student App must display an authorized Practice Package's MusicXML through the existing ST Score Rendering Layer without expanding student authority, weakening offline/privacy boundaries, or coupling the Student App to OSMD internals.

Success means:

- an authorized Practice screen can render notation through the pinned ST browser runtime;
- the renderer root remains the same DOM node for the lifetime expected by the runtime;
- runtime and renderer failures affect notation only;
- private Practice Package data remains outside Cache Storage;
- existing sharing, authentication, offline, playback, TAB, violin, editor, and teacher-authority contracts are unchanged;
- the integration remains bounded, deterministic, and testable on mobile Safari-oriented flows.

## 2. Fresh repository evidence

At design time:

- Student App `main` is `06bb110f084dffeb7b72ef93512c7c6db0ea23cf`;
- no open pull request was present;
- the current GitHub Actions test job completed with `198` tests, `198` passes, `0` failures;
- `src/practice/notationAdapter.js` already provides the Student App adapter boundary;
- `mountStudentApp()` owns notation render/dispose lifecycle;
- `openPractice()` derives notation availability from `notationAdapter.isAvailable()`;
- the Practice renderer markup creates `#st-score-root` only when notation is AVAILABLE;
- the Rendering Layer browser runtime exposes `globalThis.__ST_SCORE_RENDER_HOST__`;
- the Rendering Layer bootstrap requires `#st-score-root` while the runtime module is initialized;
- Rendering Layer contract version is `0.2.0`, with pinned OSMD `2.1.2`.

## 3. Root cause

The two existing lifecycles form a bootstrap cycle.

1. Student App opens Practice.
2. `createPracticeWorkspace()` asks whether the notation runtime is already available.
3. If the global runtime host is not installed yet, notation becomes UNAVAILABLE.
4. UNAVAILABLE notation does not produce `#st-score-root`.
5. The Rendering Layer bootstrap, however, requires `#st-score-root` at module initialization.
6. Therefore the runtime cannot be installed after the Practice UI reaches its current UNAVAILABLE state without changing lifecycle ownership.

This is an integration/lifecycle defect, not a MusicXML parsing defect.

## 4. Chosen approach

Use a same-origin, pinned Rendering Layer browser runtime with a Student App-owned runtime loader and a persistent renderer root.

The Student App remains the application shell and authority owner. The Rendering Layer remains presentation-only. The Student App does not import or traverse OSMD objects and does not duplicate Rendering Layer implementation.

### Rejected alternatives

**iframe bridge:** rejected for STUDENT-07A because it adds cross-window lifecycle, focus, VoiceOver, resize, offline caching, and messaging complexity without a current isolation requirement that justifies it.

**New Rendering Layer installer/factory API:** potentially useful later, but rejected for this stage because it requires source changes in `st-score-rendering-layer`. STUDENT-07A is intentionally scoped to the Student App consumer integration.

## 5. Runtime provenance and assets

The Student App will consume a browser-runtime export produced from the exact Rendering Layer revision recorded above, or from a separately human-approved newer revision before implementation.

The vendored runtime set must include its provenance manifest and the files required by the exported browser runtime. The Student App must not fetch renderer code from a CDN at runtime.

The integration must verify the expected renderer contract before accepting the runtime. A missing, malformed, mismatched, or incomplete runtime fails closed for notation.

The runtime source revision, renderer contract version, OSMD version, and asset hashes remain inspectable through the vendored manifest. Generated/vendor assets are not manually edited.

## 6. DOM and lifecycle ownership

Student App owns the outer Practice UI and a stable notation mount slot.

The critical invariant is:

> Once the Rendering Layer bootstrap binds to `#st-score-root`, Student App must not replace that DOM element while that runtime instance is active.

The Practice UI may update controls and status around the renderer, but ordinary state repaint must preserve the renderer root node.

The runtime loader runs only after the required root exists. It resolves one of these bounded outcomes:

- READY — pinned runtime installed and compatible;
- UNAVAILABLE — runtime intentionally/configurationally absent;
- ERROR — runtime expected but bootstrap, provenance, compatibility, or initialization failed.

Concurrent installation attempts coalesce into one in-flight initialization. A stale completion must not attach presentation to a Practice screen/package that is no longer current.

When leaving Practice, changing to a different package, signing out, or destroying the mounted Student App, the existing notation adapter/runtime presentation is disposed according to current ownership rules. Disposal failure must not expose internal exceptions or preserve stale notation.

## 7. Availability semantics

`notationAdapter.isAvailable()` must no longer be interpreted only as “the global host already exists at this exact moment.”

Student App needs a bounded distinction between:

- runtime already READY;
- runtime can be installed from the trusted local pinned assets;
- runtime is genuinely unavailable.

Practice capability derivation may advertise notation as AVAILABLE when the trusted local runtime is installable, allowing the renderer root to be created. Actual render begins only after installation succeeds.

If installation later fails, only notation transitions to ERROR. The rest of Practice remains usable.

No silent fallback to a different renderer, remote CDN, unpinned build, or raw OSMD integration is permitted.

## 8. Render flow

The target flow is:

```text
authorized Practice item
→ create Practice view model + MusicXML render source
→ render Practice shell with stable notation root
→ ensure pinned browser runtime
→ verify expected runtime/contract
→ existing notationAdapter.render({ musicXml })
→ __ST_SCORE_RENDER_HOST__.renderMusicXml(...)
→ ST Rendering Layer / OSMD presentation
```

Package/session generation checks remain authoritative. A render completion from an old Practice package or old DOM generation is discarded and disposed.

The MusicXML remains bounded by the existing package and Rendering Layer validation boundaries.

## 9. Error handling

Student-facing failures remain bounded:

- trusted runtime not configured: notation UNAVAILABLE;
- expected runtime asset/bootstrap failure: notation ERROR;
- contract mismatch: notation ERROR, no render;
- MusicXML/render failure: notation ERROR;
- stale async completion: discard/dispose without changing the current Practice;
- adapter dispose failure: suppress internal detail and clear Student App ownership state.

Raw MusicXML, stack traces, OSMD objects, Firebase/provider details, file paths, integrity internals, and runtime exception strings must not be shown to the student.

Notation failure must not mutate playback, tempo, repeat, guitar TAB, violin, sharing, authentication, or offline authorization capabilities.

## 10. Offline and privacy boundary

Static renderer runtime assets may be included in the service worker's application-shell cache.

Private or personalized Practice Package content must not be written to Cache Storage. Existing package/offline data continues to use the Student App's IndexedDB-based authorized storage path.

Service worker cache versioning must change when the pinned renderer asset set changes.

Offline acceptance requires:

- app shell available;
- pinned renderer static assets available;
- authorized package available through the existing device/offline path;
- no network dependency for renderer startup.

A cached static runtime must never imply authorization to a Practice Package.

## 11. Security and authority invariants

STUDENT-07A does not grant the renderer:

- network loading authority;
- filesystem authority;
- authentication authority;
- publication/sharing authority;
- canonical score mutation authority;
- teacher/editor authority;
- playback/audio/MIDI authority.

The Student App passes bounded in-memory MusicXML only after the Practice item has already crossed existing authorization/package validation.

The global runtime host is treated as a presentation dependency, not as a trusted source of student identity or authorization.

## 12. Expected implementation surface

Implementation should remain focused. Expected Student App changes are limited to the smallest set needed for:

- a runtime-loader module;
- notation adapter availability/installation integration;
- Practice renderer-root persistence;
- mount lifecycle synchronization;
- same-origin pinned runtime assets/provenance;
- service-worker static asset cache update;
- focused unit/contract/lifecycle tests;
- documentation of the pinned runtime revision and update procedure.

Exact filenames may be adjusted during the implementation plan after fresh inspection, but unrelated refactors are out of scope.

No source change in `st-score-rendering-layer` is authorized by this spec.

## 13. Testing requirements

Implementation evidence must cover at least:

1. runtime absent and not configured → bounded UNAVAILABLE;
2. trusted runtime installable → Practice creates the stable renderer root;
3. runtime installation success → notation render succeeds through the existing adapter;
4. repeated Student App repaint does not replace an active `#st-score-root`;
5. package switch disposes stale presentation and renders only the new package;
6. leaving Practice/sign-out/destroy disposes presentation;
7. runtime bootstrap failure → notation ERROR only;
8. renderer failure → notation ERROR only;
9. contract mismatch fails closed;
10. stale async runtime/render completion cannot overwrite current Practice state;
11. concurrent initialization does not install duplicate runtime instances;
12. static renderer assets are included in offline app-shell caching;
13. private Practice MusicXML/package content is not placed in Cache Storage;
14. existing Student App contract suite remains green;
15. browser/mobile-oriented integration evidence exercises the real pinned runtime rather than a fake global only.

Physical iPhone Safari acceptance remains a separate target-device gate; WebKit/DOM tests do not by themselves prove physical-device acceptance.

## 14. Explicit non-goals

STUDENT-07A does not implement or redesign:

- playback;
- tempo engine;
- measure repeat;
- guitar TAB generation/editing;
- violin-specific rendering;
- note hit-test/edit selection;
- Score Editor integration;
- teacher editing;
- Practice Package schema;
- Firebase authorization rules;
- public/private sharing semantics;
- Rendering Layer contract `0.2.0`;
- OSMD internals.

Those concerns require their own approved work item when needed.

## 15. Acceptance criteria

STUDENT-07A implementation is complete only when fresh evidence shows:

- an authorized Practice Package can render its MusicXML using the pinned same-origin ST browser runtime;
- runtime bootstrap no longer deadlocks on the absence of `#st-score-root`;
- the active renderer root survives Student App repaint without DOM replacement;
- navigation/package replacement/disposal cannot leave stale notation active;
- notation failures remain isolated to notation;
- offline renderer startup has no CDN/network dependency;
- private Practice content remains outside Cache Storage;
- provenance/contract mismatch fails closed;
- all existing Student App tests plus new STUDENT-07A tests pass;
- no Rendering Layer source modification was required.

## 16. Human-stop conditions

Stop and request explicit approval before implementation proceeds if fresh work shows that any of these are necessary:

- modifying `st-score-rendering-layer` source or public contract;
- changing Practice Package schema;
- changing Firebase authorization/security rules;
- adding a remote/CDN renderer dependency;
- moving private package data into Cache Storage;
- expanding student authority into editing or teacher operations;
- changing playback/TAB/violin behavior to make notation integration work.

