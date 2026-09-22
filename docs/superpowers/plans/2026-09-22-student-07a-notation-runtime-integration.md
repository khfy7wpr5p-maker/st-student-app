# STUDENT-07A Notation Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render authorized Practice Package MusicXML in ST Student App through a pinned, same-origin ST Score Rendering Layer browser runtime while preserving offline privacy, read-only authority, lifecycle isolation, and accessibility.

**Architecture:** Student App owns a small runtime loader that installs only the vendored ST browser runtime after a stable `#st-score-root` exists. The existing `notationAdapter` remains the only Student App rendering contract; `mountStudentApp` preserves the renderer DOM node across same-Practice repaint and disposes stale presentation on package/navigation/session lifecycle changes. Static runtime files join the service-worker shell allowlist, while private Practice Package data remains exclusively on the existing IndexedDB path.

**Tech Stack:** JavaScript ES modules, Node `node:test`, browser DOM, Service Worker Cache Storage for static shell only, IndexedDB for authorized Practice Packages, ST Score Rendering Layer browser runtime contract `0.2.0`, OSMD `2.1.2` only behind the ST-owned runtime.

**Spec:** `docs/superpowers/specs/2026-09-22-student-07a-notation-runtime-integration-design.md`

## Global Constraints

- Student App baseline for this plan: `main@06bb110f084dffeb7b72ef93512c7c6db0ea23cf`.
- Rendering Layer evidence baseline: `khfy7wpr5p-maker/st-score-rendering-layer@49dcb4737e802f956fc483ab2c8eac62a2508846`.
- Renderer contract remains exactly `0.2.0`.
- Vendored renderer is same-origin and exact-revision pinned; no runtime CDN fallback.
- Student App never imports or traverses OSMD product objects.
- No source change in `st-score-rendering-layer` is authorized.
- Private Practice Package/MusicXML data must never enter Cache Storage.
- Firebase authorization/rules, Practice Package schema, playback, TAB, violin, editor, and teacher authority are unchanged.
- Renderer/runtime failure affects notation only and never exposes raw MusicXML, stack traces, provider details, paths, or vendor exceptions to student UI.
- Physical iPhone/Safari/VoiceOver acceptance remains a separate target-device gate after repository verification.

## File Structure

**Create**
- `src/practice/notationRuntimeLoader.js` — owns bounded same-origin runtime installation state, compatibility handshake, and single-flight initialization.
- `test/notationRuntimeLoader.test.js` — unit tests for installability, single-flight, failure, and compatibility.
- `vendor/st-score-runtime/runtime-manifest.json` plus the exact exported runtime graph — generated/pinned static presentation assets copied byte-for-byte from the approved Rendering Layer revision.
- `docs/renderer-runtime.md` — provenance and deterministic update procedure.

**Modify**
- `src/practice/notationAdapter.js` — make availability include trusted installability and ensure runtime before rendering.
- `src/ui/main.js` — construct/inject the runtime loader; no direct OSMD dependency.
- `src/ui/mountStudentApp.js` — preserve the active renderer root across same-Practice repaint and keep stale/disposal guards.
- `src/ui/renderPracticeWorkspace.js` — keep the Nota region/root semantic contract stable.
- `service-worker.js` — version cache and allowlist pinned runtime static assets only.
- `test/notationAdapter.test.js` — loader-aware adapter contract tests.
- `test/practiceNotationLifecycle.test.js` — root identity, stale completion, package switch, sign-out/navigation/destroy behavior.
- `test/serviceWorkerRegistration.test.js` — static runtime caching and private-data exclusion assertions.
- `test/staticShell.test.js` — prove bootstrap remains ST-owned and has no direct OSMD/CDN coupling.

## Review Focus

1. **Runtime exists but is contract-incompatible:** notation must fail closed as ERROR without invoking render.
2. **Two renders race while runtime is installing:** only one install occurs and stale Practice state cannot receive presentation.
3. **Connectivity/status repaint during active Practice:** `#st-score-root` identity must remain unchanged so the runtime does not retain a detached node.
4. **Offline reload after one successful online install/cache cycle:** static runtime must start without renderer network access while authorized Practice content still comes only from IndexedDB.
5. **Package/session changes during async work:** old render/install completion must be discarded and disposed without changing the new Practice capability.

---

### Task 1: Pinned runtime loader contract

**Files:**
- Create: `src/practice/notationRuntimeLoader.js`
- Create: `test/notationRuntimeLoader.test.js`

**Interfaces:**
- Consumes: a browser-like `documentObject`, `getRuntime()`, and trusted local `bootstrapUrl`.
- Produces: `createNotationRuntimeLoader({ getRuntime, documentObject, bootstrapUrl, expectedContractVersion })` with `isInstallable(): boolean`, `isReady(): boolean`, and `ensureReady(): Promise<{ state: "READY" | "UNAVAILABLE" | "ERROR" }>`.

- [ ] **Step 1: Write failing tests for absent configuration, already-ready runtime, compatible install, contract mismatch, load failure, and single-flight initialization.**

Use a fake document whose `head.append(script)` records exactly one local module script and allows the test to trigger `load` or `error`. The compatible-runtime test must install:
```js
const runtime = {
  contractVersion: "0.2.0",
  async renderMusicXml() {},
  async dispose() {},
};
```
and assert `ensureReady()` resolves `{ state: "READY" }`. The mismatch test uses `contractVersion: "9.9.9"` and expects `{ state: "ERROR" }`.

- [ ] **Step 2: Run the focused test and confirm RED.**

Run:
```bash
node --test test/notationRuntimeLoader.test.js
```
Expected: FAIL because `notationRuntimeLoader.js` does not exist.

- [ ] **Step 3: Implement the minimal loader with explicit local bootstrap and single-flight state.**

The implementation must follow this public shape:
```js
export const NOTATION_RUNTIME_STATES = Object.freeze({
  READY: "READY",
  UNAVAILABLE: "UNAVAILABLE",
  ERROR: "ERROR",
});

export function createNotationRuntimeLoader({
  getRuntime = () => globalThis.__ST_SCORE_RENDER_HOST__,
  documentObject = globalThis.document,
  bootstrapUrl = null,
  expectedContractVersion = "0.2.0",
} = {}) {
  let installPromise = null;

  function runtimeIsCompatible(runtime) {
    return runtime !== null &&
      runtime !== undefined &&
      runtime.contractVersion === expectedContractVersion &&
      typeof runtime.renderMusicXml === "function" &&
      typeof runtime.dispose === "function";
  }

  // isInstallable() is true only for a non-empty same-origin/local configured URL
  // and a document capable of creating/attaching a module script.
  // ensureReady() first accepts a compatible existing runtime, otherwise installs
  // exactly one module script and re-checks the runtime after its load event.
  // It returns bounded states only; raw errors never escape.
}
```

Do not add network fetch, CDN fallback, dynamic package installation, or OSMD imports.

- [ ] **Step 4: Run focused tests and confirm GREEN.**

Run:
```bash
node --test test/notationRuntimeLoader.test.js
```
Expected: all loader tests PASS.

- [ ] **Step 5: Commit the task.**

```bash
git add src/practice/notationRuntimeLoader.js test/notationRuntimeLoader.test.js
git commit -m "feat: add bounded notation runtime loader"
```

### Task 2: Make the notation adapter loader-aware

**Files:**
- Modify: `src/practice/notationAdapter.js`
- Modify: `test/notationAdapter.test.js`

**Interfaces:**
- Consumes: Task 1 loader methods `isInstallable()`, `isReady()`, `ensureReady()`.
- Produces: existing `createStNotationAdapter()` interface; `isAvailable()` means compatible runtime ready **or** trusted local runtime installable, while `render()` ensures readiness before calling the ST host.

- [ ] **Step 1: Add failing adapter tests.**

Add cases equivalent to:
```js
test("trusted installable runtime makes notation available before host exists", () => {
  const adapter = createStNotationAdapter({
    getRuntime: () => undefined,
    runtimeLoader: {
      isReady: () => false,
      isInstallable: () => true,
      async ensureReady() { return { state: "READY" }; },
    },
  });
  assert.equal(adapter.isAvailable(), true);
});

test("render installs runtime before delegating", async () => {
  let runtime;
  const calls = [];
  const adapter = createStNotationAdapter({
    getRuntime: () => runtime,
    runtimeLoader: {
      isReady: () => false,
      isInstallable: () => true,
      async ensureReady() {
        runtime = {
          contractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION,
          async renderMusicXml(payload) { calls.push(payload); },
          async dispose() {},
        };
        return { state: "READY" };
      },
    },
  });
  assert.deepEqual(await adapter.render({ musicXml: "<score-partwise/>" }), {
    capability: PRACTICE_CAPABILITY_STATES.AVAILABLE,
  });
  assert.equal(calls.length, 1);
});
```

Also pin: loader UNAVAILABLE → capability UNAVAILABLE; loader ERROR/mismatch → capability ERROR; raw loader errors do not escape.

- [ ] **Step 2: Run adapter tests and confirm RED.**

```bash
node --test test/notationAdapter.test.js
```
Expected: new loader-aware assertions FAIL.

- [ ] **Step 3: Implement loader-aware availability/rendering without changing the ST payload.**

Preserve the exact current payload keys and ticket behavior. Before render:
```js
const readiness = await runtimeLoader.ensureReady();
if (readiness.state === "UNAVAILABLE") {
  return Object.freeze({ capability: PRACTICE_CAPABILITY_STATES.UNAVAILABLE });
}
if (readiness.state !== "READY") {
  return Object.freeze({ capability: PRACTICE_CAPABILITY_STATES.ERROR });
}
```
Then resolve the runtime again and delegate through the existing `renderMusicXml` call.

- [ ] **Step 4: Run focused tests and confirm GREEN.**

```bash
node --test test/notationAdapter.test.js test/notationRuntimeLoader.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit the task.**

```bash
git add src/practice/notationAdapter.js test/notationAdapter.test.js
git commit -m "feat: install trusted runtime through notation adapter"
```

### Task 3: Preserve renderer-root identity across Practice repaint

**Files:**
- Modify: `src/ui/mountStudentApp.js`
- Modify: `src/ui/renderPracticeWorkspace.js`
- Modify: `test/practiceNotationLifecycle.test.js`

**Interfaces:**
- Consumes: existing Practice state/render source and loader-aware notation adapter.
- Produces: same `mountStudentApp()` public API; active `#st-score-root` node identity is preserved for the same package while surrounding UI may repaint.

- [ ] **Step 1: Replace the string-only root fixture with a minimal DOM fixture that can track `#st-score-root` object identity, then write RED tests.**

Pin these behaviors:
```js
const firstRoot = root.querySelector("#st-score-root");
connectivity.emit("offline");
await mounted.render();
assert.equal(root.querySelector("#st-score-root"), firstRoot);
```
Also assert package `pkg-a → pkg-b` disposes old notation before a new root/render is accepted, and a stale async render completion cannot mark the new package AVAILABLE.

- [ ] **Step 2: Run lifecycle tests and confirm RED.**

```bash
node --test test/practiceNotationLifecycle.test.js
```
Expected: root-identity/stale-completion tests FAIL with current `root.innerHTML = markup` repaint.

- [ ] **Step 3: Implement bounded root preservation.**

Keep `renderPracticeWorkspace()` semantic output:
```html
<section aria-labelledby="notation-heading">
  <h2 id="notation-heading">Nota</h2>
  <div id="st-score-root" role="region" aria-label="Nota"></div>
</section>
```

In `mountStudentApp.paint()`, when the presentation key is the same active Practice package and both old/new markup contain an AVAILABLE notation root:
1. retain the existing `#st-score-root` element;
2. update surrounding Student App markup without replacing that node;
3. restore the retained node into the new notation slot;
4. keep `domGeneration` stable for presentation-only repaint that preserved the root;
5. continue incrementing generation when the Practice package/screen/root ownership changes.

Do not preserve the node across package change, sign-out, Home, or destroy.

- [ ] **Step 4: Run lifecycle and UI tests.**

```bash
node --test test/practiceNotationLifecycle.test.js test/studentAppOfflineUi.test.js test/renderPracticeWorkspace.test.js
```
Expected: PASS; existing Turkish Nota/VoiceOver semantics unchanged.

- [ ] **Step 5: Commit the task.**

```bash
git add src/ui/mountStudentApp.js src/ui/renderPracticeWorkspace.js test/practiceNotationLifecycle.test.js
git commit -m "fix: preserve active notation root across repaint"
```

### Task 4: Wire the pinned runtime into the browser bootstrap

**Files:**
- Modify: `src/ui/main.js`
- Modify: `test/staticShell.test.js`
- Create/Modify: `vendor/st-score-runtime/**` generated runtime assets
- Create: `docs/renderer-runtime.md`

**Interfaces:**
- Consumes: Task 1 loader, approved Rendering Layer browser-runtime export at revision `49dcb4737e802f956fc483ab2c8eac62a2508846`.
- Produces: browser bootstrap configured with a same-origin `./vendor/st-score-runtime/browser-bootstrap.mjs` and inspectable runtime provenance.

- [ ] **Step 1: Generate/export the browser runtime from the approved Rendering Layer revision without editing that repository.**

Use the Rendering Layer's existing:
```bash
node scripts/export-browser-runtime.mjs browser-runtime
```
with `ST_SCORE_RENDERER_SOURCE_REVISION=49dcb4737e802f956fc483ab2c8eac62a2508846`.

Copy the resulting runtime directory byte-for-byte to:
```text
vendor/st-score-runtime/
```

Before copying, inspect `runtime-manifest.json` and require:
```json
{
  "runtimeTarget": "browser",
  "scoreRendererContractVersion": "0.2.0",
  "rendererSourceRevision": "49dcb4737e802f956fc483ab2c8eac62a2508846"
}
```
and vendor OSMD version `2.1.2`.

- [ ] **Step 2: Write RED bootstrap/provenance tests.**

In `test/staticShell.test.js`, assert:
- `main.js` imports/constructs `createNotationRuntimeLoader`;
- bootstrap URL is same-origin `./vendor/st-score-runtime/browser-bootstrap.mjs`;
- no `https://` renderer URL or direct OSMD import appears;
- manifest contains the exact approved source revision, contract, runtime target, and OSMD version;
- every manifest-listed file exists.

Expected RED before wiring.

- [ ] **Step 3: Wire loader + adapter in `main.js`.**

Use:
```js
const notationRuntimeLoader = createNotationRuntimeLoader({
  bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  expectedContractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION,
});
const notationAdapter = createStNotationAdapter({
  runtimeLoader: notationRuntimeLoader,
});
```
Do not expose the loader to controller business state and do not import vendor modules directly.

- [ ] **Step 4: Document provenance/update procedure.**

`docs/renderer-runtime.md` must record:
- exact Rendering Layer revision;
- export command;
- required manifest fields;
- byte-for-byte copy rule;
- no manual generated-asset edits;
- service-worker cache version must change when assets change;
- physical iPhone acceptance required after integration.

- [ ] **Step 5: Run focused tests.**

```bash
node --test test/staticShell.test.js test/notationRuntimeLoader.test.js test/notationAdapter.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit the task.**

```bash
git add src/ui/main.js test/staticShell.test.js vendor/st-score-runtime docs/renderer-runtime.md
git commit -m "feat: pin ST score browser runtime"
```

### Task 5: Cache static renderer assets without caching Practice data

**Files:**
- Modify: `service-worker.js`
- Modify: `test/serviceWorkerRegistration.test.js`

**Interfaces:**
- Consumes: exact Task 4 runtime manifest/file list.
- Produces: `st-student-shell-v3` static shell cache containing renderer runtime files only; existing IndexedDB Practice path unchanged.

- [ ] **Step 1: Add RED service-worker policy tests.**

Assert:
```js
assert.match(source, /st-student-shell-v3/);
assert.match(source, /vendor\/st-score-runtime\/browser-bootstrap\.mjs/);
assert.match(source, /vendor\/st-score-runtime\/runtime-manifest\.json/);
assert.doesNotMatch(
  source,
  /practicePackages|canonicalEvents|score\.data|musicxml.*cache|cache.*musicxml/i,
);
```
Also iterate manifest file paths and assert each static path appears in the allowlist.

- [ ] **Step 2: Run focused tests and confirm RED.**

```bash
node --test test/serviceWorkerRegistration.test.js
```
Expected: FAIL on v2/missing renderer assets.

- [ ] **Step 3: Update static allowlist and cache version.**

Change:
```js
const CACHE_NAME = "st-student-shell-v3";
```
Add only the vendored static runtime files required by `runtime-manifest.json` to `SHELL_ASSETS`. Do not add wildcard runtime caching or Practice/package URLs.

- [ ] **Step 4: Run focused offline-policy tests.**

```bash
node --test test/serviceWorkerRegistration.test.js test/indexedDbOfflineRepository.test.js test/offlineAwareSharingService.test.js
```
Expected: PASS and no Practice data path added to service worker.

- [ ] **Step 5: Commit the task.**

```bash
git add service-worker.js test/serviceWorkerRegistration.test.js
git commit -m "feat: cache pinned notation runtime offline"
```

### Task 6: Integrated lifecycle and failure isolation verification

**Files:**
- Modify: `test/practiceNotationLifecycle.test.js`
- Modify: `test/notationRuntimeLoader.test.js`
- Modify only if needed for testability, not behavior: `src/ui/mountStudentApp.js`, `src/practice/notationRuntimeLoader.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: regression evidence for race, stale state, failure isolation, and cleanup.

- [ ] **Step 1: Add the five Review Focus regressions if any are not already pinned.**

Tests must explicitly cover:
```text
mismatched contract -> ERROR, render not called
two ensureReady calls -> one bootstrap append
same-package connectivity repaint -> identical score-root object
offline/static runtime path -> no renderer CDN/network fallback
package/session change during pending render -> stale completion discarded/disposed
```

- [ ] **Step 2: Add sign-out/destroy cleanup assertions.**

For an active successful notation render:
```js
await mounted.destroy();
assert.equal(disposeCalls, 1);
```
and for sign-out/navigation verify the old runtime presentation is disposed before the non-Practice screen becomes authoritative.

- [ ] **Step 3: Run the focused integration set.**

```bash
node --test   test/notationRuntimeLoader.test.js   test/notationAdapter.test.js   test/practiceNotationLifecycle.test.js   test/serviceWorkerRegistration.test.js   test/staticShell.test.js
```
Expected: PASS.

- [ ] **Step 4: Commit regression evidence.**

```bash
git add test/notationRuntimeLoader.test.js test/notationAdapter.test.js test/practiceNotationLifecycle.test.js
git commit -m "test: cover notation runtime lifecycle boundaries"
```

### Task 7: Full verification, documentation truth, and PR gate

**Files:**
- Modify only if stale statements are found: `README.md`, `docs/architecture.md`
- Create: `docs/superpowers/progress/2026-09-22-student-07a-notation-runtime-integration.md`

**Interfaces:**
- Consumes: final implementation branch.
- Produces: exact-head verification evidence and a bounded STUDENT-07A pull request ready for human review; no merge.

- [ ] **Step 1: Refresh only stale notation-runtime documentation.**

State the actual truth: Firebase/offline Student App remains unchanged; notation now uses the pinned same-origin ST browser runtime; playback is still not provided by Rendering Layer and remains STUDENT-07B work.

- [ ] **Step 2: Run the complete repository suite.**

```bash
npm test
```
Expected: all tests PASS; record exact total/pass/fail counts in the progress document.

- [ ] **Step 3: Run source-boundary scans.**

```bash
grep -RInE 'opensheetmusicdisplay|new[[:space:]]+OSMD' src test --exclude-dir=node_modules
grep -RInE 'practicePackages|canonicalEvents|score\.data|musicxml' service-worker.js
grep -RInE 'https?://.*(osmd|score|renderer)' src vendor/st-score-runtime/runtime-manifest.json
```
Expected:
- no direct OSMD product coupling in Student App source;
- no private Practice data caching path in service worker;
- no remote renderer/CDN dependency.

- [ ] **Step 4: Verify branch diff against the approved baseline.**

```bash
git diff --check 06bb110f084dffeb7b72ef93512c7c6db0ea23cf...HEAD
git diff --stat 06bb110f084dffeb7b72ef93512c7c6db0ea23cf...HEAD
git status --short
```
Expected: no whitespace errors, only STUDENT-07A files, clean worktree.

- [ ] **Step 5: Perform independent whole-branch review.**

Use Codex Engineering Guardrails `code-verification` against:
- the approved spec;
- this plan;
- baseline `06bb110f084dffeb7b72ef93512c7c6db0ea23cf`;
- final branch head.

Any material finding returns to the owning TDD task before PR creation.

- [ ] **Step 6: Create the progress evidence document and commit final documentation.**

Record:
- exact branch/head;
- runtime source revision/contract/OSMD version;
- focused/full test commands and counts;
- source-boundary scan results;
- residual limitation: physical iPhone/Safari/VoiceOver acceptance not yet proven by repository CI.

```bash
git add README.md docs/architecture.md docs/superpowers/progress/2026-09-22-student-07a-notation-runtime-integration.md
git commit -m "docs: record STUDENT-07A verification"
```

- [ ] **Step 7: Open one bounded pull request against `main`.**

PR title:
```text
STUDENT-07A: integrate pinned notation runtime
```

PR body must summarize:
- pinned Rendering Layer revision;
- stable renderer-root lifecycle;
- offline static-runtime cache;
- privacy/authority invariants;
- exact test counts;
- physical iPhone acceptance still pending.

- [ ] **Step 8: Wait for exact-head CI and inspect all checks.**

Require green exact-head CI. Do not infer success from local/focused tests alone.

- [ ] **Step 9: STOP before merge.**

Do not merge, deploy, change Pages settings, change Firebase rules, seed live Firestore, or begin STUDENT-07B until the human explicitly approves the next boundary.
