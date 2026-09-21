# STUDENT-04 Read-only Practice Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the STUDENT-03 Practice shell into an immutable, capability-aware read-only Practice Workspace that reuses the ST Score Rendering Layer for notation and never invents playback/TAB/violin semantics.

**Architecture:** Keep the authorized Practice Package behind a private controller boundary. Project it into a frozen student-safe workspace view-model plus a separate private MusicXML render source. Use a Student App-owned notation adapter around the pinned ST renderer runtime; missing or failed renderer capability degrades only notation, while playback/TAB/violin remain independently and honestly unavailable unless a trusted port explicitly supports them.

**Tech Stack:** Node.js ESM, `node:test`, semantic HTML, vanilla browser JavaScript, existing STUDENT-02 Sharing Service, ST Score Rendering Layer generic browser runtime contract `0.2.0`.

**Spec:** `docs/superpowers/specs/2026-09-21-student-04-practice-workspace-design.md`

## Global Constraints

- Student App base main is `d497c04825a7412784ba5ba9c590e579bad5f0f7`.
- Referenced ST Score Rendering Layer revision is `13c32eefccd5bf2c227e815aa27aae4a0583801d`.
- Student App must not import or depend directly on OpenSheetMusicDisplay.
- The Student App must not invent a private canonical-event timing format.
- Playback must remain independent from notation and default to `UNAVAILABLE` without a trusted playback port.
- Non-null `content.guitarTab` and `content.violin` objects do not become supported merely by existing.
- MusicXML is internal render input and must never appear in student-facing HTML or status text.
- A capability failure must not globally close the Practice Workspace.
- Student App remains read-only: no publish, revoke, edit, delete, teacher approval, OMR, or editor actions.
- No auth/cloud provider, offline cache, social, gamification, payment, or physical iPhone VoiceOver scope is added.
- Merge waits for explicit human approval.

## File Structure

- Create `src/practice/practiceCapabilities.js`: capability constants and pure derivation rules.
- Create `src/practice/practiceWorkspace.js`: safe immutable workspace projection and private render-source projection.
- Create `src/practice/notationAdapter.js`: Student App-owned adapter for `globalThis.__ST_SCORE_RENDER_HOST__`.
- Create `src/ui/renderPracticeWorkspace.js`: semantic capability-aware Practice HTML.
- Modify `src/ui/studentAppController.js`: keep full package/render source private; expose only safe workspace state.
- Modify `src/ui/renderStudentApp.js`: delegate Practice screen to the focused workspace renderer.
- Modify `src/ui/mountStudentApp.js`: synchronize notation runtime lifecycle after the Practice DOM exists.
- Modify `src/ui/main.js`: inject the default global ST notation adapter; do not load or vendor renderer assets.
- Modify `README.md` and `docs/architecture.md`: document actual STUDENT-04 behavior.
- Create focused tests under `test/`.

## Review Focus

1. A global renderer object that exists but lacks the exact required `renderMusicXml` or `dispose` methods must be treated as `UNAVAILABLE`, not partially trusted — Task 2 tests this malformed-runtime case.
2. A renderer exception containing MusicXML or internal details must become only `ERROR` and the raw message must never enter HTML — Tasks 2 and 4 test this.
3. Re-rendering the same Practice screen must not repeatedly call the notation runtime or create an infinite render/update loop — Task 4 tests one-render-per-practice-key behavior.
4. Switching/leaving Practice must dispose the prior notation runtime before another work becomes active — Task 4 tests navigation and replacement cleanup.
5. Valid packages carrying arbitrary non-null `guitarTab`, `violin`, or unknown `canonicalEvents` objects must not accidentally unlock unsupported capabilities — Task 1 tests all three.

---

### Task 1: Capability Rules and Safe Workspace Projection

**Files:**
- Create: `src/practice/practiceCapabilities.js`
- Create: `src/practice/practiceWorkspace.js`
- Create: `test/practiceCapabilities.test.js`
- Create: `test/practiceWorkspace.test.js`

**Interfaces:**
- Consumes: STUDENT-02 delivery item `{ publication, package }` returned by `sharingService.getPracticeItem()`.
- Produces:
  - `PRACTICE_CAPABILITY_STATES`
  - `derivePracticeCapabilities({ pkg, notationRuntimeAvailable, playbackPort })`
  - `createPracticeWorkspace({ deliveryItem, notationRuntimeAvailable, playbackPort })`
  - `withNotationCapability(viewModel, capability)`
  - result shape `{ viewModel, renderSource }`, both frozen.

- [ ] **Step 1: Write failing capability tests**

Create `test/practiceCapabilities.test.js` with explicit expected states:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  PRACTICE_CAPABILITY_STATES,
  derivePracticeCapabilities,
} from "../src/practice/practiceCapabilities.js";

const pkg = {
  content: {
    canonicalEvents: [{ any: "shape" }],
    guitarTab: { unknown: true },
    violin: { unknown: true },
  },
  practice: {
    tempoBpm: 80,
    allowTempoChange: true,
    allowMeasureRepeat: true,
  },
};

test("unknown canonical events do not enable playback", () => {
  const result = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable: true,
    playbackPort: null,
  });

  assert.equal(result.notation, PRACTICE_CAPABILITY_STATES.AVAILABLE);
  assert.equal(result.playback, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.tempoChange, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.measureRepeat, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
});

test("undefined-shape guitar and violin objects remain unavailable", () => {
  const result = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable: true,
    playbackPort: null,
  });

  assert.equal(result.guitarTab, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.violin, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
});

test("tempo and repeat require teacher permission and trusted port support", () => {
  const playbackPort = {
    canPlayPackage: () => true,
    canChangeTempoForPackage: () => true,
    canRepeatMeasureForPackage: () => true,
  };

  const result = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable: true,
    playbackPort,
  });

  assert.equal(result.playback, PRACTICE_CAPABILITY_STATES.AVAILABLE);
  assert.equal(result.tempoChange, PRACTICE_CAPABILITY_STATES.AVAILABLE);
  assert.equal(result.measureRepeat, PRACTICE_CAPABILITY_STATES.AVAILABLE);

  const denied = derivePracticeCapabilities({
    pkg: {
      ...pkg,
      practice: {
        ...pkg.practice,
        allowTempoChange: false,
        allowMeasureRepeat: false,
      },
    },
    notationRuntimeAvailable: true,
    playbackPort,
  });

  assert.equal(denied.tempoChange, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(denied.measureRepeat, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
});
```

The trusted port is capability evidence only in STUDENT-04; no playback engine or audio implementation is created.

- [ ] **Step 2: Run capability tests and verify RED**

Run:

```bash
node --test test/practiceCapabilities.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/practice/practiceCapabilities.js`.

- [ ] **Step 3: Implement minimal capability derivation**

Create `src/practice/practiceCapabilities.js`:

```js
export const PRACTICE_CAPABILITY_STATES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  ERROR: "ERROR",
});

function trueFrom(port, method, pkg) {
  return typeof port?.[method] === "function" && port[method](pkg) === true;
}

export function derivePracticeCapabilities({
  pkg,
  notationRuntimeAvailable,
  playbackPort = null,
}) {
  const playback = trueFrom(playbackPort, "canPlayPackage", pkg);
  const allowTempoChange = pkg.practice?.allowTempoChange === true;
  const allowMeasureRepeat = pkg.practice?.allowMeasureRepeat === true;

  return Object.freeze({
    notation: notationRuntimeAvailable
      ? PRACTICE_CAPABILITY_STATES.AVAILABLE
      : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    playback: playback
      ? PRACTICE_CAPABILITY_STATES.AVAILABLE
      : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    tempoChange:
      playback &&
      allowTempoChange &&
      trueFrom(playbackPort, "canChangeTempoForPackage", pkg)
        ? PRACTICE_CAPABILITY_STATES.AVAILABLE
        : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    measureRepeat:
      playback &&
      allowMeasureRepeat &&
      trueFrom(playbackPort, "canRepeatMeasureForPackage", pkg)
        ? PRACTICE_CAPABILITY_STATES.AVAILABLE
        : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    guitarTab: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    violin: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  });
}
```

Do not inspect `canonicalEvents`, `guitarTab`, or `violin` internals.

- [ ] **Step 4: Run capability tests and verify GREEN**

Run:

```bash
node --test test/practiceCapabilities.test.js
```

Expected: all Task 1 capability tests PASS.

- [ ] **Step 5: Write failing workspace-projection tests**

Create `test/practiceWorkspace.test.js` using a valid Practice Package delivery item. Require these exact properties:

```js
test("workspace keeps MusicXML out of the student view model", () => {
  const result = createPracticeWorkspace({
    deliveryItem,
    notationRuntimeAvailable: true,
  });

  assert.equal(result.viewModel.title, "Etüt 1");
  assert.equal("musicXml" in result.viewModel, false);
  assert.equal(JSON.stringify(result.viewModel).includes("score-partwise"), false);
  assert.deepEqual(result.renderSource, {
    kind: "musicxml",
    musicXml: "<score-partwise>SAFE RENDER INPUT</score-partwise>",
    sourceId: "pkg-1",
  });
});

test("workspace snapshot and render source are immutable", () => {
  const result = createPracticeWorkspace({
    deliveryItem,
    notationRuntimeAvailable: true,
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.viewModel), true);
  assert.equal(Object.isFrozen(result.viewModel.capabilities), true);
  assert.equal(Object.isFrozen(result.renderSource), true);
});

test("notation capability can change without changing other capabilities", () => {
  const result = createPracticeWorkspace({
    deliveryItem,
    notationRuntimeAvailable: true,
  });

  const next = withNotationCapability(
    result.viewModel,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );

  assert.equal(next.capabilities.notation, PRACTICE_CAPABILITY_STATES.ERROR);
  assert.equal(
    next.capabilities.playback,
    result.viewModel.capabilities.playback,
  );
});
```

Also assert that recipient IDs, approval metadata, raw publication objects, and arbitrary package internals are absent from `viewModel`.

- [ ] **Step 6: Run workspace tests and verify RED**

Run:

```bash
node --test test/practiceWorkspace.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/practice/practiceWorkspace.js`.

- [ ] **Step 7: Implement safe workspace projection**

Create `src/practice/practiceWorkspace.js`.

Required behavior:

```js
import { assertPublishablePracticePackage } from "../sharing/packageEligibility.js";
import {
  PRACTICE_CAPABILITY_STATES,
  derivePracticeCapabilities,
} from "./practiceCapabilities.js";

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function createPracticeWorkspace({
  deliveryItem,
  notationRuntimeAvailable,
  playbackPort = null,
}) {
  const pkg = deliveryItem.package;
  assertPublishablePracticePackage(pkg);

  const capabilities = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable,
    playbackPort,
  });

  const viewModel = Object.freeze({
    publicationId: deliveryItem.publication.publicationId,
    packageId: pkg.packageId,
    title: pkg.title,
    capabilities,
    practice: Object.freeze({
      tempoBpm: positiveFinite(pkg.practice?.tempoBpm),
    }),
  });

  const renderSource = Object.freeze({
    kind: "musicxml",
    musicXml: pkg.content.score.data,
    sourceId: pkg.packageId,
  });

  return Object.freeze({ viewModel, renderSource });
}

export function withNotationCapability(viewModel, capability) {
  if (!Object.values(PRACTICE_CAPABILITY_STATES).includes(capability)) {
    throw new TypeError("unsupported notation capability state");
  }

  return Object.freeze({
    ...viewModel,
    capabilities: Object.freeze({
      ...viewModel.capabilities,
      notation: capability,
    }),
  });
}
```

Do not place the render source inside `viewModel`.

- [ ] **Step 8: Run Task 1 tests and full suite**

Run:

```bash
node --test test/practiceCapabilities.test.js test/practiceWorkspace.test.js
npm test
```

Expected: focused tests PASS and the existing 67-test baseline remains green.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/practice/practiceCapabilities.js src/practice/practiceWorkspace.js test/practiceCapabilities.test.js test/practiceWorkspace.test.js
git commit -m "feat: add STUDENT-04 workspace capability model"
```

---

### Task 2: ST Score Rendering Layer Notation Adapter

**Files:**
- Create: `src/practice/notationAdapter.js`
- Create: `test/notationAdapter.test.js`

**Interfaces:**
- Consumes: renderer-owned global runtime from the pinned ST renderer revision.
- Produces:
  - `ST_SCORE_RENDERER_CONTRACT_VERSION = "0.2.0"`
  - `createStNotationAdapter({ getRuntime })`
  - adapter methods `isAvailable()`, `render({ musicXml })`, and `dispose()`.
- `render()` returns only `{ capability: "AVAILABLE" | "UNAVAILABLE" | "ERROR" }`; it never returns raw exceptions.

The pinned generic runtime owns its DOM root by the fixed id `st-score-root`. Student App therefore creates that root in Task 4 before calling the adapter. The adapter does not pass an arbitrary container argument to `renderMusicXml`.

- [ ] **Step 1: Write failing adapter tests**

Create `test/notationAdapter.test.js`:

```js
test("missing or malformed ST runtime is unavailable", () => {
  for (const runtime of [
    undefined,
    {},
    { renderMusicXml() {} },
    { dispose() {} },
  ]) {
    const adapter = createStNotationAdapter({
      getRuntime: () => runtime,
    });
    assert.equal(adapter.isAvailable(), false);
  }
});

test("adapter sends the pinned ST runtime payload", async () => {
  const calls = [];
  const runtime = {
    async renderMusicXml(payload) {
      calls.push(payload);
    },
    async dispose() {},
  };
  const adapter = createStNotationAdapter({ getRuntime: () => runtime });

  const result = await adapter.render({
    musicXml: "<score-partwise/>",
  });

  assert.deepEqual(result, {
    capability: PRACTICE_CAPABILITY_STATES.AVAILABLE,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contractVersion, "0.2.0");
  assert.equal(calls[0].musicxml, "<score-partwise/>");
  assert.equal(calls[0].pageMode, "continuous");
  assert.equal(calls[0].autoResize, true);
  assert.equal(calls[0].drawTitle, false);
  assert.equal(calls[0].drawComposer, false);
  assert.match(calls[0].ticket, /^[1-9][0-9]{0,18}$/);
});

test("runtime failures become bounded ERROR without leaking exception data", async () => {
  const adapter = createStNotationAdapter({
    getRuntime: () => ({
      async renderMusicXml() {
        throw new Error("<score-partwise>SECRET</score-partwise>");
      },
      async dispose() {},
    }),
  });

  assert.deepEqual(
    await adapter.render({ musicXml: "<score-partwise>SECRET</score-partwise>" }),
    { capability: PRACTICE_CAPABILITY_STATES.ERROR },
  );
});
```

Add a test that `dispose()` is idempotent when runtime is unavailable and delegates once when present.

- [ ] **Step 2: Run adapter tests and verify RED**

Run:

```bash
node --test test/notationAdapter.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the global ST runtime adapter**

Create `src/practice/notationAdapter.js`.

Required payload and failure behavior:

```js
import { PRACTICE_CAPABILITY_STATES } from "./practiceCapabilities.js";

export const ST_SCORE_RENDERER_CONTRACT_VERSION = "0.2.0";

export function createStNotationAdapter({
  getRuntime = () => globalThis.__ST_SCORE_RENDER_HOST__,
} = {}) {
  let ticket = 0;

  function runtimeOrNull() {
    const runtime = getRuntime();
    return runtime &&
      typeof runtime.renderMusicXml === "function" &&
      typeof runtime.dispose === "function"
      ? runtime
      : null;
  }

  return Object.freeze({
    isAvailable() {
      return runtimeOrNull() !== null;
    },

    async render({ musicXml }) {
      const runtime = runtimeOrNull();
      if (runtime === null) {
        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        });
      }

      ticket += 1;
      try {
        await runtime.renderMusicXml({
          contractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION,
          musicxml: musicXml,
          ticket: String(ticket),
          pageMode: "continuous",
          autoResize: true,
          drawTitle: false,
          drawComposer: false,
        });
        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        });
      } catch {
        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.ERROR,
        });
      }
    },

    async dispose() {
      const runtime = runtimeOrNull();
      if (runtime !== null) {
        try {
          await runtime.dispose();
        } catch {
          // Disposal must not leak runtime details into Student UI.
        }
      }
    },
  });
}
```

No OSMD import is permitted.

- [ ] **Step 4: Run adapter tests and full suite**

Run:

```bash
node --test test/notationAdapter.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/practice/notationAdapter.js test/notationAdapter.test.js
git commit -m "feat: add ST notation runtime adapter"
```

---

### Task 3: Controller Integration Without Exposing MusicXML

**Files:**
- Modify: `src/ui/studentAppController.js`
- Modify: `test/studentAppController.test.js`

**Interfaces:**
- Consumes: `createPracticeWorkspace()`, `withNotationCapability()`, injected `notationAdapter`, optional trusted `playbackPort`.
- Produces:
  - existing `getState()` with safe `state.practice` view-model only;
  - new internal-facing `getPracticeRenderSource()`;
  - new internal-facing `setNotationCapability(capability)`.
- The action dispatcher must not expose `getPracticeRenderSource` or `setNotationCapability` as student actions.

- [ ] **Step 1: Add failing controller tests**

Extend `test/studentAppController.test.js`.

Required tests:

```js
test("open Practice stores safe workspace but keeps MusicXML private", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingServiceWithPracticePackage(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
  });

  controller.openPractice("pub-public");

  const state = controller.getState();
  assert.equal(state.practice.title, "Public Etüt");
  assert.equal(JSON.stringify(state).includes("score-partwise"), false);
  assert.deepEqual(controller.getPracticeRenderSource(), {
    kind: "musicxml",
    musicXml: "<score-partwise>SECRET SCORE</score-partwise>",
    sourceId: "pkg-public",
  });
});

test("missing notation runtime keeps workspace open and notation unavailable", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingServiceWithPracticePackage(),
    initialSession: student,
    notationAdapter: { isAvailable: () => false },
  });

  controller.openPractice("pub-public");

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.PRACTICE);
  assert.equal(
    controller.getState().practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
});

test("notation ERROR does not change playback state", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingServiceWithPracticePackage(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
  });

  controller.openPractice("pub-public");
  const before = controller.getState().practice.capabilities.playback;
  controller.setNotationCapability(PRACTICE_CAPABILITY_STATES.ERROR);

  assert.equal(
    controller.getState().practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );
  assert.equal(controller.getState().practice.capabilities.playback, before);
});
```

Also test:
- `getPracticeRenderSource()` returns `null` outside Practice;
- `showHome()` and `signOut()` clear the private render source;
- public controller still exposes no `publish`, `revoke`, `edit`, or `delete`.

- [ ] **Step 2: Run controller tests and verify RED**

Run:

```bash
node --test test/studentAppController.test.js
```

Expected: FAIL because the new dependencies/methods are not wired.

- [ ] **Step 3: Replace the title-only Practice projection**

Modify `src/ui/studentAppController.js`:

- remove `toPracticeSummary()`;
- add constructor inputs:

```js
notationAdapter = null,
playbackPort = null,
```

- keep `let activePracticeRenderSource = null;`;
- in `openPractice(publicationId)`:
  1. fetch the authorized delivery item through `sharingService.getPracticeItem`;
  2. call `createPracticeWorkspace({ deliveryItem: item, notationRuntimeAvailable: notationAdapter?.isAvailable?.() === true, playbackPort })`;
  3. store only `viewModel` in frozen UI state;
  4. store `renderSource` in the private variable.

Implement:

```js
getPracticeRenderSource() {
  return state.screen === STUDENT_APP_SCREENS.PRACTICE
    ? activePracticeRenderSource
    : null;
},

setNotationCapability(capability) {
  if (state.screen !== STUDENT_APP_SCREENS.PRACTICE || state.practice === null) {
    throw new Error("practice workspace is not active");
  }

  state = freezeState({
    ...state,
    practice: withNotationCapability(state.practice, capability),
  });
  return state;
},
```

Clear `activePracticeRenderSource` on `showHome()`, `signOut()`, and before replacing an existing Practice.

- [ ] **Step 4: Run controller tests and full suite**

Run:

```bash
node --test test/studentAppController.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/ui/studentAppController.js test/studentAppController.test.js
git commit -m "feat: connect STUDENT-04 workspace to controller"
```

---

### Task 4: Semantic Practice Renderer and Notation Lifecycle

**Files:**
- Create: `src/ui/renderPracticeWorkspace.js`
- Create: `test/renderPracticeWorkspace.test.js`
- Modify: `src/ui/renderStudentApp.js`
- Modify: `src/ui/mountStudentApp.js`
- Create: `test/practiceNotationLifecycle.test.js`

**Interfaces:**
- Consumes: safe `state.practice` only; it never receives the private render source.
- Produces:
  - `renderPracticeWorkspace(practice)`;
  - Practice DOM root `#st-score-root` only when notation is `AVAILABLE`;
  - notation runtime synchronization in `mountStudentApp`.

- [ ] **Step 1: Write failing Practice renderer tests**

Create `test/renderPracticeWorkspace.test.js`.

Required assertions:

```js
test("AVAILABLE notation renders the renderer-owned root", () => {
  const html = renderPracticeWorkspace(
    makePractice({ notation: PRACTICE_CAPABILITY_STATES.AVAILABLE }),
  );

  assert.match(html, /id="st-score-root"/);
  assert.match(html, /aria-label="Nota"/);
});

test("UNAVAILABLE notation shows a short bounded message", () => {
  const html = renderPracticeWorkspace(
    makePractice({ notation: PRACTICE_CAPABILITY_STATES.UNAVAILABLE }),
  );

  assert.doesNotMatch(html, /id="st-score-root"/);
  assert.match(html, /Nota görünümü bu çalışma için kullanılamıyor/);
});

test("ERROR notation does not leak runtime details", () => {
  const html = renderPracticeWorkspace(
    makePractice({ notation: PRACTICE_CAPABILITY_STATES.ERROR }),
  );

  assert.match(html, /Nota görüntülenemedi/);
  assert.doesNotMatch(html, /score-partwise|stack|exception|MusicXML/);
});

test("playback unavailable never renders a fake enabled play button", () => {
  const html = renderPracticeWorkspace(makePractice());
  assert.doesNotMatch(html, /data-action="play-practice"/);
  assert.match(html, /Dinleme bu çalışma için kullanılamıyor/);
});
```

Also verify:
- title is escaped;
- tempo is displayed only when positive finite;
- unavailable TAB/violin do not render empty sections;
- no recipient/revision/debug/OMR/internal IDs appear in HTML.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```bash
node --test test/renderPracticeWorkspace.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement focused Practice renderer**

Create `src/ui/renderPracticeWorkspace.js`.

It may import the existing `escapeHtml` helper only if doing so does not create a circular dependency. Prefer moving `escapeHtml` into a tiny `src/ui/escapeHtml.js` helper if necessary, with existing renderer tests preserved.

The notation branch must be equivalent to:

```js
function renderNotation(capability) {
  if (capability === PRACTICE_CAPABILITY_STATES.AVAILABLE) {
    return `
      <section aria-labelledby="notation-heading">
        <h2 id="notation-heading">Nota</h2>
        <div id="st-score-root" role="region" aria-label="Nota"></div>
      </section>
    `;
  }

  if (capability === PRACTICE_CAPABILITY_STATES.ERROR) {
    return '<p role="status">Nota görüntülenemedi.</p>';
  }

  return '<p>Nota görünümü bu çalışma için kullanılamıyor.</p>';
}
```

Playback remains a truthful unavailable message in the default build. Do not render active playback controls unless a later trusted port/action surface is actually wired.

- [ ] **Step 4: Delegate Practice rendering from `renderStudentApp`**

Replace the old title-only `renderPractice()` implementation with:

```js
case STUDENT_APP_SCREENS.PRACTICE:
  body = renderPracticeWorkspace(state.practice);
  break;
```

Existing Sign In/Home/Public Pool/My Work output must remain unchanged.

- [ ] **Step 5: Run renderer tests and existing renderer suite**

Run:

```bash
node --test test/renderPracticeWorkspace.test.js test/renderStudentApp.test.js
```

Expected: PASS.

- [ ] **Step 6: Write failing notation lifecycle tests**

Create `test/practiceNotationLifecycle.test.js` around a minimal fake root and fake controller/notation adapter.

Required behaviors:

```js
test("Practice AVAILABLE renders notation once for the active package", async () => {
  // render the same state twice
  // assert notationAdapter.render called exactly once
});

test("renderer failure changes only notation to ERROR", async () => {
  // fake adapter returns { capability: ERROR }
  // assert controller.setNotationCapability(ERROR) called
  // assert workspace remains PRACTICE
});

test("leaving Practice disposes notation runtime", async () => {
  // first render Practice, then render Home
  // assert notationAdapter.dispose called once
});

test("switching package keys disposes old runtime before rendering new source", async () => {
  // practice package A -> package B
  // assert dispose occurs before second render call
});
```

Use an adapter call log so ordering is directly asserted.

- [ ] **Step 7: Run lifecycle tests and verify RED**

Run:

```bash
node --test test/practiceNotationLifecycle.test.js
```

Expected: FAIL because mount has no Practice notation synchronization.

- [ ] **Step 8: Add bounded notation synchronization to `mountStudentApp`**

Extend `mountStudentApp({ root, controller, requestSignIn, notationAdapter = null })`.

Maintain private mount-local state:

```js
let activeNotationKey = null;
```

After `root.innerHTML = renderStudentApp(...)`:

1. If screen is not Practice:
   - if `activeNotationKey !== null`, await/schedule adapter disposal through one serialized lifecycle path;
   - reset key.
2. If Practice notation is not `AVAILABLE`, do not invoke renderer.
3. If Practice package key equals `activeNotationKey`, do nothing.
4. For a new Practice key:
   - dispose old adapter state first;
   - read `controller.getPracticeRenderSource()`;
   - call `notationAdapter.render({ musicXml: source.musicXml })`;
   - set `activeNotationKey`;
   - when returned capability differs from current notation state, call `controller.setNotationCapability(result.capability)` and rerender once.

Keep raw caught errors out of `status`; continue using bounded student messages.

Because the mount renderer is currently synchronous, implement the async notation synchronization as a serialized promise chain owned by the mount rather than making click dispatch race against multiple independent renders.

- [ ] **Step 9: Run lifecycle tests and full suite**

Run:

```bash
node --test test/practiceNotationLifecycle.test.js
npm test
```

Expected: PASS with no repeated render loop.

- [ ] **Step 10: Commit Task 4**

```bash
git add src/ui/renderPracticeWorkspace.js src/ui/renderStudentApp.js src/ui/mountStudentApp.js test/renderPracticeWorkspace.test.js test/practiceNotationLifecycle.test.js
git commit -m "feat: render STUDENT-04 practice workspace"
```

---

### Task 5: Default Wiring, Architecture Docs, and Final Verification

**Files:**
- Modify: `src/ui/main.js`
- Modify: `test/staticShell.test.js`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create: `docs/superpowers/progress/2026-09-21-student-04-practice-workspace.md`

**Interfaces:**
- Default browser build injects `createStNotationAdapter()`.
- It does not fetch, copy, or vendor renderer assets.
- When `globalThis.__ST_SCORE_RENDER_HOST__` is absent, notation is honestly `UNAVAILABLE`.
- A host/deployment may later preload the exact verified renderer runtime asset graph so the same adapter becomes available without changing Student UI contracts.

- [ ] **Step 1: Write failing default-wiring tests**

Extend `test/staticShell.test.js`:

```js
test("default bootstrap wires the ST-owned notation adapter only", async () => {
  const source = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /createStNotationAdapter/);
  assert.doesNotMatch(source, /opensheetmusicdisplay|new OSMD|from ["']osmd/i);
  assert.doesNotMatch(source, /score-partwise|fake.*playback/i);
});
```

Also assert `package.json` has no new OSMD dependency.

- [ ] **Step 2: Run static tests and verify RED**

Run:

```bash
node --test test/staticShell.test.js
```

Expected: FAIL because `main.js` does not yet inject the adapter.

- [ ] **Step 3: Wire the default notation adapter**

Update `src/ui/main.js`:

```js
import { createStNotationAdapter } from "../practice/notationAdapter.js";

const notationAdapter = createStNotationAdapter();

const controller = createStudentAppController({
  sharingService: unconfiguredSharingService,
  notationAdapter,
});

mountStudentApp({
  root,
  controller,
  notationAdapter,
});
```

Do not add runtime asset URLs, credentials, CDN imports, or OSMD imports.

- [ ] **Step 4: Run static and full tests**

Run:

```bash
node --test test/staticShell.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Update architecture documentation**

Update `README.md` and append a production-reality `STUDENT-04` section to `docs/architecture.md` documenting:

- safe workspace view-model vs private render source;
- capability states `AVAILABLE / UNAVAILABLE / ERROR`;
- default playback unavailable;
- tempo/repeat support gates only;
- unknown TAB/violin shapes remain unavailable;
- MusicXML never enters student HTML;
- ST renderer contract version `0.2.0` and pinned source revision `13c32eefccd5bf2c227e815aa27aae4a0583801d`;
- generic runtime root id `st-score-root`;
- missing global runtime -> notation unavailable;
- render failure -> notation error only;
- default Student App does not vendor the renderer asset graph.

Create the progress ledger with exact RED/GREEN CI run IDs as implementation proceeds.

- [ ] **Step 6: Whole-branch review**

Inspect:

```text
src/practice/*
src/ui/studentAppController.js
src/ui/renderPracticeWorkspace.js
src/ui/renderStudentApp.js
src/ui/mountStudentApp.js
src/ui/main.js
test/*
README.md
docs/architecture.md
```

Search explicitly for:

```text
opensheetmusicdisplay
OSMD
score-partwise
recipientStudentId
approvedRevision
omr
debug
publish
revoke
```

Interpret matches by file role; tests and docs may intentionally contain forbidden-term assertions. Production Student UI code must not expose forbidden data or direct vendor imports.

- [ ] **Step 7: Run final full suite**

Run:

```bash
npm test
```

Expected: all existing and new tests PASS, 0 failures.

- [ ] **Step 8: Verify exact branch-head CI**

Push the final branch head and verify GitHub CI:

- workflow event: `push`;
- workflow head SHA equals the exact final branch SHA;
- conclusion: `success`;
- test count from logs matches the local/full-suite result.

Do not accept an earlier green commit as final evidence.

- [ ] **Step 9: Open the PR and verify PR-head CI**

Open a focused PR:

```text
Title: STUDENT-04: Read-only Practice Workspace
Base: main
Head: feat/student-04-practice-workspace
```

PR body must record:
- exact base SHA;
- exact head SHA;
- test count;
- final push CI run;
- no direct OSMD dependency;
- no playback engine;
- no guessed TAB/violin/canonical event semantics;
- notation degraded behavior;
- explicit statement: do not merge without human approval.

Then verify the `pull_request` CI on the same exact head SHA is `success`, PR is mergeable, and open review threads are zero.

- [ ] **Step 10: Stop before merge**

Report the PR URL, exact head SHA, exact test count, push/PR CI results, and remaining conscious boundaries:

- renderer runtime asset deployment is not bundled by STUDENT-04;
- default notation is `UNAVAILABLE` when the verified runtime is not present;
- playback remains unavailable without a trusted port/contract;
- offline semantics remain STUDENT-05;
- physical iPhone/Safari/VoiceOver acceptance remains STUDENT-06.

Do not merge until explicit human approval.
