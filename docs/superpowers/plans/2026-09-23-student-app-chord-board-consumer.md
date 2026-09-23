# ST Student App CHORD_BOARD Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ST Student App safely list, open, render, and reopen offline SesliTab Secure Delivery `CHORD_BOARD` assignments without changing the existing SCORE notation/playback path.

**Architecture:** Secure Delivery becomes a strict discriminated union at the assignment/package boundary. SCORE continues through the existing `getScorePracticeItem() -> PRACTICE` flow, while CHORD_BOARD uses a dedicated validator, `getChordBoardPracticeItem()`, controller state, student view model, and read-only chord workspace. Both package kinds reuse the authenticated Secure Delivery authority, student-scoped IndexedDB repository, revocation/status flow, and session-race protections.

**Tech Stack:** Node.js 24, ESM JavaScript, `node:test`, browser DOM/string renderers, IndexedDB through the existing repository abstraction, GitHub Actions CI, SonarQube Cloud.

**Spec:** `docs/superpowers/specs/2026-09-23-student-app-chord-board-consumer-design.md`

## Global Constraints

- Target repository only: `khfy7wpr5p-maker/st-student-app`.
- SesliTab repository is read-only reference during implementation.
- No writes to `khfy7wpr5p-maker/seslitab-guitar-reader` or `st-guitar-chord-board`.
- SCORE package validation, notation rendering, MusicXML handling, playback, playback recovery, and `#st-score-root` lifecycle must remain semantically unchanged.
- CHORD_BOARD must never be converted to MusicXML or routed through SCORE Practice.
- Exact chord authority is the immutable `content.chordBoard` snapshot; never reconstruct from chord symbol, catalog order, or voicing index.
- CHORD_BOARD package `schemaVersion` is exactly `"1.0.0"`.
- CHORD_BOARD package `packageType` is exactly `"CHORD_BOARD"`.
- Voicing snapshot `schemaVersion` is exactly `1`.
- Voicing snapshot `sourceKind` is exactly `"chord_board_exact_voicing"`.
- Fret semantics: `-1` muted, `0` open, `1..20` fretted.
- Finger semantics: `-1` muted, `0` open/no finger, `1..4` fretted.
- Source array index `0..5` maps guitar strings `6..1`, low E to high E.
- Private SCORE/CHORD_BOARD packages remain in the authorized IndexedDB repository; never store private package payloads in Service Worker Cache Storage.
- Authorization comes from the authenticated server response and current session, never a request/body student ID.
- Cross-student cached access, revoked access, identity mismatch, malformed/mixed payloads, and stale-session async responses fail closed.
- Student App remains read-only for assignment/lifecycle authority.
- No new chord audio/playback behavior.
- No production Firebase/Auth/Firestore changes, credentials, billing changes, backend deployment, or production deployment.
- No automatic merge.
- Implementation starts from the latest `main` with the approved spec/plan carried into the isolated feature branch; if `main` advances after this plan, fresh-read and resolve base drift before Task 1.
- Current pre-implementation product baseline at plan-writing time: `main = 3cb883224ec34403ad2768845630f6f7fcb03745`, full suite `414/414 PASS`.

## Review Focus

- **Valid shape but wrong package discriminator:** a row with `practiceType: "CHORD_BOARD"` and a valid SCORE package, or vice versa, must fail closed rather than being coerced. Task 2 pins both directions.
- **Exact identity mismatch hidden inside otherwise valid CHORD_BOARD data:** `deliveryId`, `assignmentId`, `packageId`, and `assignmentAuthority.assignmentId` must agree. Tasks 1–2 pin each boundary.
- **Same delivery ID cached under a different authenticated student:** offline lookup must return no package for the second student. Task 6 pins cross-student denial using the real repository seam.
- **Late CHORD_BOARD response after sign-out/session switch:** the previous session must not open or overwrite the current screen. Task 4 pins generation isolation.
- **Visually renderable but semantically inconsistent voicing:** invalid muted/open/fretted finger combinations or malformed barre geometry must be rejected before UI projection. Tasks 1 and 5 pin rejection plus accessible projection.

---

## File Structure Locked by This Plan

### New files

- `src/contracts/studentChordBoardPackage.js` — strict Student App-owned CHORD_BOARD package and exact-voicing validator/restorer.
- `src/contracts/secureDeliveryPackage.js` — tiny SCORE/CHORD_BOARD discriminator/restorer used by Secure Delivery assignment/offline boundaries.
- `src/ui/chordBoardViewModel.js` — student-safe projection from restored CHORD_BOARD package to controller/renderer data; created in Task 4 so controller state never holds raw package internals.
- `src/ui/renderChordBoardWorkspace.js` — read-only semantic/visual chord workspace.
- `test/studentChordBoardPackage.test.js` — strict CHORD_BOARD package contract.
- `test/student08ChordBoardReadService.test.js` — Student08 Secure Delivery CHORD_BOARD read path.
- `test/student08ChordBoardController.test.js` — controller/session/screen isolation.
- `test/student08ChordBoardUi.test.js` — My Work action + workspace + accessibility.
- `test/student08ChordBoardOffline.test.js` — authorized IndexedDB/in-memory offline behavior and type isolation.

### Existing files expected to change

- `src/contracts/secureDeliveryAssignment.js` — accept strict SCORE/CHORD_BOARD union while preserving row field/identity rules.
- `src/sharing/secureDeliveryStudent08ReadService.js` — add dedicated `getChordBoardPracticeItem()`.
- `src/offline/offlineRecord.js` — replace SCORE-only package eligibility at the Secure Delivery item boundary with the strict secure-delivery package union.
- `src/offline/secureDeliveryOfflineReadService.js` — add CHORD_BOARD online/offline read/cache method; keep SCORE semantics intact.
- `src/offline/secureDeliveryStatusService.js` — no new public method; consume union-aware assignment validation so CHORD_BOARD access status works.
- `src/ui/student08Composition.js` — only completeness wiring if the offline wrapper requires the new method.
- `src/ui/studentAppController.js` — dedicated `CHORD_BOARD` screen/state and type-specific open path.
- `src/ui/renderStudentApp.js` — make CHORD_BOARD My Work cards actionable and route dedicated workspace rendering.
- `test/student08SecureDeliveryContracts.test.js`
- `test/secureDeliveryStudent08ReadService.test.js`
- `test/secureDeliveryOfflineReadService.test.js`
- `test/student08MyWorkUi.test.js`
- `test/student08Ui.test.js`
- `test/student08OfflineOnlineRegressionMatrix.test.js`
- `test/student08ResponsiveAccessibility.test.js`
- `docs/architecture.md` — update only after implementation behavior is green and verified.

### Files deliberately not changed

- SCORE notation renderer/runtime.
- SCORE MusicXML playback compiler.
- Piano sample/runtime assets.
- Service Worker private-data boundary.
- SesliTab producer code.
- Firebase production configuration.

---

### Task 1: Strict StudentChordBoardPackageV1 contract

**Files:**
- Create: `src/contracts/studentChordBoardPackage.js`
- Create: `test/studentChordBoardPackage.test.js`
- Reference only: SesliTab `src/services/studentChordBoardPackageV1.js`
- Reference only: SesliTab `src/services/chordBoardVoicingCanonical.js`

**Interfaces:**
- Consumes: plain JSON Secure Delivery CHORD_BOARD package.
- Produces:
  - `STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION = "1.0.0"`
  - `STUDENT_CHORD_BOARD_PACKAGE_TYPE = "CHORD_BOARD"`
  - `validateStudentChordBoardPackageV1(value) -> { ok: boolean, errors: readonly string[] }`
  - `restoreStudentChordBoardPackageV1(raw) -> deeply frozen StudentChordBoardPackageV1`
  - `normalizeChordBoardVoicingSnapshot(value) -> deeply frozen exact snapshot`

- [ ] **Step 1: Write RED contract tests for a valid package and deep immutability**

Use a local fixture whose musical data is explicit rather than imported from SesliTab runtime code:

```js
const VALID_CHORD_PACKAGE = {
  schemaVersion: "1.0.0",
  packageType: "CHORD_BOARD",
  packageId: "assignment-chord-a",
  title: "Am Akor Çalışması",
  assignmentAuthority: {
    assignmentId: "assignment-chord-a",
    state: "teacher_assigned",
    assignedAt: "2026-09-23T10:00:00Z",
  },
  publication: {
    scope: "student_private",
    recipientStudentId: "server-student-a",
  },
  content: {
    chordBoard: {
      schemaVersion: 1,
      sourceKind: "chord_board_exact_voicing",
      chord: {
        canonicalSymbol: "Am",
        canonicalRoot: "A",
        quality: "minor",
        displayRoot: "A",
        displaySymbol: "Am",
      },
      voicing: {
        frets: [-1, 0, 2, 2, 1, 0],
        fingers: [-1, 0, 2, 3, 1, 0],
        barres: [],
        shape: "open",
        generated: false,
        curated: true,
      },
      provenance: {
        sourceRepository: "st-guitar-chord-board",
        sourceCommit: "1111111111111111111111111111111111111111",
        catalogFingerprint:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      voicingFingerprint:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  },
  practice: {
    teacherNote: "60 BPM ile çalış.",
  },
};
```

Assertions:

```js
const result = validateStudentChordBoardPackageV1(VALID_CHORD_PACKAGE);
assert.deepEqual(result, { ok: true, errors: [] });

const restored = restoreStudentChordBoardPackageV1(VALID_CHORD_PACKAGE);
assert.equal(restored.packageType, "CHORD_BOARD");
assert.equal(restored.content.chordBoard.voicing.frets[2], 2);
assert.equal(Object.isFrozen(restored), true);
assert.equal(Object.isFrozen(restored.content.chordBoard.voicing.frets), true);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test test/studentChordBoardPackage.test.js
```

Expected: FAIL because `studentChordBoardPackage.js` does not exist.

- [ ] **Step 3: Add RED fail-closed tests for exact keys, discriminators, identities, frets/fingers, barres, and review-focus inputs**

Add cases that mutate one thing at a time:

```js
assert.equal(
  validateStudentChordBoardPackageV1({
    ...VALID_CHORD_PACKAGE,
    packageType: "SCORE",
  }).ok,
  false,
);

assert.equal(
  validateStudentChordBoardPackageV1({
    ...VALID_CHORD_PACKAGE,
    packageId: "wrong-id",
  }).ok,
  false,
);

const mixed = structuredClone(VALID_CHORD_PACKAGE);
mixed.content.score = { format: "musicxml", data: "<score-partwise/>" };
assert.equal(validateStudentChordBoardPackageV1(mixed).ok, false);

const badFinger = structuredClone(VALID_CHORD_PACKAGE);
badFinger.content.chordBoard.voicing.frets[0] = -1;
badFinger.content.chordBoard.voicing.fingers[0] = 1;
assert.equal(validateStudentChordBoardPackageV1(badFinger).ok, false);

const badBarre = structuredClone(VALID_CHORD_PACKAGE);
badBarre.content.chordBoard.voicing.barres = [
  { finger: 1, fret: 5, fromString: 1, toString: 6 },
];
assert.equal(validateStudentChordBoardPackageV1(badBarre).ok, false);
```

Also reject:
- extra top-level package key;
- missing required top-level key;
- `schemaVersion !== "1.0.0"`;
- `assignmentAuthority.state !== "teacher_assigned"`;
- non-private publication;
- empty recipient;
- malformed six-string arrays;
- fret above 20;
- finger above 4;
- malformed provenance/fingerprint format;
- cyclic/non-plain JSON in `practice`;
- non-string `practice.teacherNote`.

- [ ] **Step 4: Implement the minimal strict validator/restorer**

Mirror producer semantics locally. Use exact-key helpers, plain-data checks, six-integer normalization, barre normalization, and deep freeze.

Core branch:

```js
export function validateStudentChordBoardPackageV1(value) {
  const errors = [];
  // exact top-level validation
  // discriminator + identity validation
  // publication validation
  // exact snapshot validation
  // practice JSON validation
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

export function restoreStudentChordBoardPackageV1(raw) {
  const result = validateStudentChordBoardPackageV1(raw);
  if (!result.ok) {
    throw new TypeError(
      `invalid StudentChordBoardPackageV1: ${result.errors.join("; ")}`,
    );
  }

  return deepFreeze({
    schemaVersion: "1.0.0",
    packageType: "CHORD_BOARD",
    packageId: raw.packageId,
    title: raw.title,
    assignmentAuthority: { ...raw.assignmentAuthority },
    publication: { ...raw.publication },
    content: {
      chordBoard: normalizeChordBoardVoicingSnapshot(
        raw.content.chordBoard,
      ),
    },
    practice: cloneFrozenJson(raw.practice),
  });
}
```

Do not calculate or guess a new voicing. Validate the supplied fingerprint format but do not expose it to UI.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test test/studentChordBoardPackage.test.js
```

Expected: PASS.

- [ ] **Step 6: Run current SCORE contract tests**

Run:

```bash
node --test test/practicePackage.test.js test/student08SecureDeliveryContracts.test.js
```

Expected: PASS; SCORE behavior unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/contracts/studentChordBoardPackage.js test/studentChordBoardPackage.test.js
git commit -m "feat: add strict Student CHORD_BOARD package contract"
```

---

### Task 2: Secure Delivery SCORE/CHORD_BOARD discriminated union

**Files:**
- Create: `src/contracts/secureDeliveryPackage.js`
- Modify: `src/contracts/secureDeliveryAssignment.js`
- Modify: `test/student08SecureDeliveryContracts.test.js`

**Interfaces:**
- Consumes:
  - existing `validatePracticePackage(pkg)`
  - Task 1 `restoreStudentChordBoardPackageV1(pkg)`
- Produces:
  - `restoreSecureDeliveryPackage({ practiceType, package: raw }) -> restored SCORE or CHORD_BOARD package`
  - union-aware `createSecureDeliveryAssignmentRow(value)`

- [ ] **Step 1: Write RED tests for valid CHORD_BOARD assignment rows**

Add a row fixture:

```js
const row = {
  deliveryId: "assignment-chord-a",
  assignmentId: "assignment-chord-a",
  packageId: "assignment-chord-a",
  practiceType: "CHORD_BOARD",
  teacherNote: "60 BPM ile çalış.",
  state: "ACTIVE",
  assignedAt: "2026-09-23T10:00:00Z",
  deliveredAt: "2026-09-23T10:01:00Z",
  package: VALID_CHORD_PACKAGE,
};

const restored = createSecureDeliveryAssignmentRow(row);
assert.equal(restored.practiceType, "CHORD_BOARD");
assert.equal(restored.package.packageType, "CHORD_BOARD");
```

Expected RED: current contract throws `practiceType must be SCORE`.

- [ ] **Step 2: Add RED mixed/discriminator authority tests**

Pin both review-focus directions:

```js
assert.throws(
  () =>
    createSecureDeliveryAssignmentRow({
      ...row,
      practiceType: "SCORE",
    }),
  /package|practiceType|SCORE|CHORD_BOARD/i,
);

assert.throws(
  () =>
    createSecureDeliveryAssignmentRow({
      ...scoreRow,
      practiceType: "CHORD_BOARD",
    }),
  /package|practiceType|SCORE|CHORD_BOARD/i,
);
```

Also assert failures for:
- CHORD_BOARD `packageId !== assignmentId`;
- CHORD_BOARD `assignmentAuthority.assignmentId !== assignmentId`;
- CHORD_BOARD `practice.teacherNote !== row.teacherNote`;
- unknown `practiceType`;
- unknown CHORD_BOARD `packageType`;
- extra row fields;
- `deliveryId !== assignmentId`;
- non-private package.

- [ ] **Step 3: Run focused RED tests**

Run:

```bash
node --test test/student08SecureDeliveryContracts.test.js
```

Expected: CHORD_BOARD cases FAIL while existing SCORE cases stay PASS.

- [ ] **Step 4: Implement `secureDeliveryPackage.js`**

Minimal public surface:

```js
export function restoreSecureDeliveryPackage({
  practiceType,
  package: raw,
}) {
  if (practiceType === PRACTICE_TYPES.SCORE) {
    const validation = validatePracticePackage(raw);
    if (!validation.ok) {
      throw new TypeError(
        `invalid SCORE secure delivery package: ${validation.errors.join("; ")}`,
      );
    }
    if (Object.hasOwn(raw, "packageType")) {
      throw new TypeError("SCORE package must not declare packageType");
    }
    return cloneAndFreeze(raw);
  }

  if (practiceType === PRACTICE_TYPES.CHORD_BOARD) {
    return restoreStudentChordBoardPackageV1(raw);
  }

  throw new TypeError("unsupported Secure Delivery practiceType");
}
```

Do not widen SCORE validation beyond its existing contract.

- [ ] **Step 5: Update `createSecureDeliveryAssignmentRow()` to restore by discriminator**

Replace the SCORE-only branch with:

```js
if (!Object.values(PRACTICE_TYPES).includes(value.practiceType)) {
  throw new TypeError("practiceType must be SCORE or CHORD_BOARD");
}

const pkg = restoreSecureDeliveryPackage({
  practiceType: value.practiceType,
  package: value.package,
});

if (pkg.packageId !== packageId) {
  throw new Error("packageId must match package");
}
```

For CHORD_BOARD additionally require:

```js
if (
  pkg.assignmentAuthority.assignmentId !== assignmentId ||
  pkg.practice.teacherNote !== value.teacherNote
) {
  throw new Error("CHORD_BOARD assignment authority mismatch");
}
```

Preserve existing `student_private`, row-key, state, delivery identity, timestamp, and clone/freeze behavior.

- [ ] **Step 6: Run focused + SCORE regression tests**

Run:

```bash
node --test   test/student08SecureDeliveryContracts.test.js   test/secureDeliveryStudent08ReadService.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add   src/contracts/secureDeliveryPackage.js   src/contracts/secureDeliveryAssignment.js   test/student08SecureDeliveryContracts.test.js
git commit -m "feat: accept strict CHORD_BOARD Secure Delivery rows"
```

---

### Task 3: Dedicated Student08 CHORD_BOARD read service

**Files:**
- Modify: `src/sharing/secureDeliveryStudent08ReadService.js`
- Create: `test/student08ChordBoardReadService.test.js`
- Modify: `test/secureDeliveryStudent08ReadService.test.js`

**Interfaces:**
- Consumes: Task 2 union-aware `createSecureDeliveryAssignmentRow()`.
- Produces:
  - existing `getScorePracticeItem({ session, assignmentId })`
  - new `getChordBoardPracticeItem({ session, assignmentId })`
  - SCORE returns `{ accessRef: { kind: "SECURE_DELIVERY", deliveryId }, practiceType: "SCORE", package }`
  - CHORD_BOARD returns `{ accessRef: { kind: "SECURE_DELIVERY", deliveryId }, practiceType: "CHORD_BOARD", package }`

- [ ] **Step 1: Write RED test that lists/details a CHORD_BOARD assignment**

Use an API fake returning one valid CHORD_BOARD row. Assert:

```js
const items = await service.listAssignments({
  session,
  state: "ACTIVE",
});
assert.equal(items[0].practiceType, "CHORD_BOARD");
assert.equal(items[0].title, "Am Akor Çalışması");

const detail = await service.getAssignment({
  session,
  assignmentId: "assignment-chord-a",
});
assert.equal(detail.assignmentId, "assignment-chord-a");
```

- [ ] **Step 2: Write RED test for `getChordBoardPracticeItem()` and SCORE isolation**

```js
const item = await service.getChordBoardPracticeItem({
  session,
  assignmentId: "assignment-chord-a",
});

assert.deepEqual(item.accessRef, {
  kind: "SECURE_DELIVERY",
  deliveryId: "assignment-chord-a",
});
assert.equal(item.package.packageType, "CHORD_BOARD");

await assert.rejects(
  () =>
    service.getScorePracticeItem({
      session,
      assignmentId: "assignment-chord-a",
    }),
  /assignment type unavailable/i,
);
```

Use a call counter to prove CHORD_BOARD does not invoke another SCORE-specific API path; both methods may share `exactAssignment()`, but the public method selection must stay explicit.

- [ ] **Step 3: Add identity/session failure tests**

Pin:
- missing authenticated session;
- response assignment ID mismatch;
- unknown state filter;
- duplicate assignment IDs;
- SCORE request through CHORD_BOARD method;
- CHORD_BOARD request through SCORE method.

- [ ] **Step 4: Run focused RED tests**

Run:

```bash
node --test   test/student08ChordBoardReadService.test.js   test/secureDeliveryStudent08ReadService.test.js
```

Expected: new CHORD_BOARD method tests FAIL before implementation.

- [ ] **Step 5: Implement the dedicated method**

Add:

```js
async getChordBoardPracticeItem(args = {}) {
  const row = await exactAssignment(args);

  if (row.practiceType !== PRACTICE_TYPES.CHORD_BOARD) {
    throw new Error("assignment type unavailable");
  }

  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: row.deliveryId,
    }),
    practiceType: PRACTICE_TYPES.CHORD_BOARD,
    package: row.package,
  });
},
```

Update `getScorePracticeItem()` only by adding the explicit envelope discriminator:
```js
practiceType: PRACTICE_TYPES.SCORE,
```
All SCORE validation, accessRef identity, package contents, and error behavior remain unchanged.

- [ ] **Step 6: Run focused tests**

Same command as Step 4. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add   src/sharing/secureDeliveryStudent08ReadService.js   test/student08ChordBoardReadService.test.js   test/secureDeliveryStudent08ReadService.test.js
git commit -m "feat: add Student08 CHORD_BOARD read path"
```

---

### Task 4: Controller state and dedicated CHORD_BOARD screen

**Files:**
- Create: `src/ui/chordBoardViewModel.js`
- Modify: `src/ui/studentAppController.js`
- Create: `test/student08ChordBoardController.test.js`
- Modify: `test/student08Ui.test.js`

**Interfaces:**
- Consumes: Task 3 `getChordBoardPracticeItem()`.
- Produces:
  - `createChordBoardViewModel(item) -> frozen student-safe view model`
  - `STUDENT_APP_SCREENS.CHORD_BOARD = "chord_board"`
  - controller state property `chordBoard` containing only that view model
  - dedicated type-specific `openAssignment()` behavior
  - no CHORD_BOARD entry into SCORE Practice activation.

- [ ] **Step 1: Write RED controller test for type-specific routing**

Build a read-service fake with counters:

```js
const calls = [];
const service = {
  getAssignment() {
    return {
      assignmentId: "assignment-chord-a",
      practiceType: PRACTICE_TYPES.CHORD_BOARD,
    };
  },
  getScorePracticeItem() {
    calls.push("score");
    throw new Error("must not run");
  },
  getChordBoardPracticeItem() {
    calls.push("chord");
    return chordItem;
  },
  // existing required list/pool methods...
};
```

After `controller.openAssignment("assignment-chord-a")` assert:

```js
assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.CHORD_BOARD);
assert.deepEqual(calls, ["chord"]);
assert.equal(controller.getState().practice, null);
```

- [ ] **Step 2: Write RED session-generation race test**

Make `getChordBoardPracticeItem()` resolve after sign-out or after a new student signs in.

Expected:

```js
assert.notEqual(controller.getState().screen, STUDENT_APP_SCREENS.CHORD_BOARD);
assert.equal(controller.getState().chordBoard ?? null, null);
```

The stale response must be ignored exactly like the existing SCORE request generation guard.

- [ ] **Step 3: Write RED sign-out and SCORE regression tests**

Assert:
- sign-out clears `chordBoard`;
- SCORE still calls only `getScorePracticeItem()`;
- SCORE still lands on `PRACTICE`;
- CHORD_BOARD never sets `activePracticePackage`;
- playback recovery on CHORD_BOARD screen is a no-op.

- [ ] **Step 4: Run focused RED tests**

Run:

```bash
node --test   test/student08ChordBoardController.test.js   test/student08Ui.test.js
```

Expected: CHORD_BOARD screen/state tests FAIL.

- [ ] **Step 5: Create the student-safe CHORD_BOARD view-model projection**

Create `src/ui/chordBoardViewModel.js` now, before controller activation, so raw package provenance never enters controller state.

```js
const stringState = (fret) =>
  fret === -1 ? "MUTED" : fret === 0 ? "OPEN" : "FRETTED";

export function createChordBoardViewModel(item) {
  const pkg = item.package;
  const snapshot = pkg.content.chordBoard;

  return Object.freeze({
    packageId: pkg.packageId,
    title: pkg.title,
    teacherNote: pkg.practice.teacherNote,
    chord: Object.freeze({
      displaySymbol: snapshot.chord.displaySymbol,
      displayRoot: snapshot.chord.displayRoot,
    }),
    strings: Object.freeze(
      snapshot.voicing.frets.map((fret, index) =>
        Object.freeze({
          stringNumber: 6 - index,
          fret,
          state: stringState(fret),
          finger: snapshot.voicing.fingers[index],
        }),
      ),
    ),
    barres: Object.freeze(
      snapshot.voicing.barres.map((barre) =>
        Object.freeze({ ...barre }),
      ),
    ),
    offlineAvailable:
      item.offlineAvailability?.deviceAvailable === true,
    offlineSaveFailed:
      item.offlineAvailability?.saveFailed === true,
  });
}
```

Add controller tests that serialize the resulting state and assert it contains none of:
`sourceRepository`, `sourceCommit`, `catalogFingerprint`, `voicingFingerprint`, or `recipientStudentId`.

- [ ] **Step 6: Extend frozen state shape without disturbing existing screens**

Add `chordBoard = null` to the state factory:

```js
function freezeState({
  screen,
  session = null,
  items = [],
  practice = null,
  chordBoard = null,
  // existing properties...
}) {
  const value = {
    screen,
    session,
    items: Object.freeze([...items]),
    practice,
    chordBoard,
  };
  // existing optional fields...
  return Object.freeze(value);
}
```

Add:

```js
CHORD_BOARD: "chord_board",
```

to `STUDENT_APP_SCREENS`.

- [ ] **Step 7: Add a focused CHORD_BOARD activation helper**

Keep it separate from `activatePracticeItem()`:

```js
function activateChordBoardItem({
  item,
  session,
  requestGeneration,
}) {
  if (!sessionRequestIsCurrent(session, requestGeneration)) {
    return state;
  }

  state = freezeState({
    ...state,
    screen: STUDENT_APP_SCREENS.CHORD_BOARD,
    practice: null,
    chordBoard: toChordBoardViewModel(item),
  });

  return state;
}
```

Import and use the Task 4 `createChordBoardViewModel()` projection. Do not place raw package objects in public controller state.

- [ ] **Step 8: Update `openAssignment()`**

Required branch:

```js
if (assignment.practiceType === PRACTICE_TYPES.CHORD_BOARD) {
  const itemResult =
    student08ReadService.getChordBoardPracticeItem({
      session,
      assignmentId,
    });

  return resolveMaybe(itemResult, (item) =>
    activateChordBoardItem({
      item,
      session,
      requestGeneration,
    }),
  );
}

if (assignment.practiceType !== PRACTICE_TYPES.SCORE) {
  throw new Error("assignment type unavailable");
}
```

Existing SCORE branch stays below this and remains unchanged in behavior.

- [ ] **Step 9: Run focused tests**

Same command as Step 4. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add   src/ui/studentAppController.js   test/student08ChordBoardController.test.js   test/student08Ui.test.js
git commit -m "feat: add dedicated CHORD_BOARD student screen"
```

---

### Task 5: Student-safe CHORD_BOARD view model, My Work action, renderer, and accessibility

**Files:**
- Modify: `src/ui/chordBoardViewModel.js`
- Create: `src/ui/renderChordBoardWorkspace.js`
- Modify: `src/ui/renderStudentApp.js`
- Create: `test/student08ChordBoardUi.test.js`
- Modify: `test/student08MyWorkUi.test.js`
- Modify: `test/student08ResponsiveAccessibility.test.js`
- Modify: `index.html` only for minimal CHORD_BOARD workspace CSS required by the new view.

**Interfaces:**
- Consumes: Task 4 `createChordBoardViewModel(item)` plus controller CHORD_BOARD state.
- Produces:
  - completed projection tests for the existing `createChordBoardViewModel(item)`
  - `renderChordBoardWorkspace(viewModel) -> HTML string`
  - My Work CHORD_BOARD card uses existing `open-assignment` action.

- [ ] **Step 1: Write RED projection tests for exact six-string semantics**

For source arrays:

```js
frets: [-1, 0, 2, 2, 1, 0]
fingers: [-1, 0, 2, 3, 1, 0]
```

assert the projected list is:

```js
[
  { stringNumber: 6, fret: -1, state: "MUTED", finger: -1 },
  { stringNumber: 5, fret: 0, state: "OPEN", finger: 0 },
  { stringNumber: 4, fret: 2, state: "FRETTED", finger: 2 },
  { stringNumber: 3, fret: 2, state: "FRETTED", finger: 3 },
  { stringNumber: 2, fret: 1, state: "FRETTED", finger: 1 },
  { stringNumber: 1, fret: 0, state: "OPEN", finger: 0 },
]
```

Also assert exact barre fields are copied, not inferred.

- [ ] **Step 2: Write RED data-minimization test**

Assert serialized view model does not contain:

```js
[
  "sourceRepository",
  "sourceCommit",
  "catalogFingerprint",
  "voicingFingerprint",
  "recipientStudentId",
]
```

Teacher note and display symbol must remain.

- [ ] **Step 3: Run the Task 4 view-model tests and make only projection corrections if they expose a defect**

Run:

```bash
node --test test/student08ChordBoardController.test.js
```

Expected: PASS. If a test added in Steps 1–2 reveals that Task 4's projection omitted required student-safe chord data, change only `src/ui/chordBoardViewModel.js` and rerun until PASS. Do not add provenance or fingerprint fields.

- [ ] **Step 4: Write RED My Work test converting CHORD_BOARD from unavailable to actionable**

Replace the old intentional non-actionable expectation with:

```js
assert.match(html, /class="assignment-type">Akor çalışması/);
assert.match(
  html,
  /data-action="open-assignment"[^>]*data-assignment-id="chord-1"/s,
);
assert.doesNotMatch(
  html,
  /Bu akor çalışması henüz kullanıma hazır değil/,
);
```

SCORE card assertions remain unchanged.

- [ ] **Step 5: Write RED workspace accessibility tests**

Expected semantic HTML must include:

```html
<section class="chord-board-workspace" role="region" aria-label="Akor çalışması">
  <h1>Am</h1>
  <ol class="chord-string-list" aria-label="Gitar telleri">
    ...
  </ol>
</section>
```

Assert student-readable strings contain equivalent information to:

```text
6. tel: kapalı.
5. tel: açık.
4. tel: 2. perde, 2. parmak.
```

For a barre fixture assert an accessible sentence equivalent to:

```text
1. parmak bare: 5. perde, 6. telden 1. tele.
```

Also assert:
- teacher note has an explicit heading/label;
- no provenance/fingerprint strings;
- no `#st-score-root`;
- no `play-practice`, `pause-practice`, tempo, or measure-repeat controls.

- [ ] **Step 6: Implement `renderChordBoardWorkspace()` with a visual diagram plus semantic list**

Renderer must escape all student-visible text with the existing `escapeHtml` helper.

Use explicit helpers:

```js
function stringDescription(item) {
  if (item.state === "MUTED") {
    return `${item.stringNumber}. tel: kapalı.`;
  }
  if (item.state === "OPEN") {
    return `${item.stringNumber}. tel: açık.`;
  }
  return (
    `${item.stringNumber}. tel: ` +
    `${item.fret}. perde, ${item.finger}. parmak.`
  );
}
```

Render the semantic list independently from the visual markers so accessibility does not depend on CSS.

Visual diagram rules:
- six fixed string columns;
- muted/open marker above nut;
- fretted marker at exact fret;
- finger number in marker;
- barre spans exact `fromString` through `toString` at exact fret;
- if a valid fret is above the fixed first-position range, derive a visual fret window from the minimum positive fret but never modify musical data.

Do not infer a barre from repeated finger numbers.

- [ ] **Step 7: Wire `renderStudentApp()`**

For `STUDENT_APP_SCREENS.CHORD_BOARD`:

```js
body = renderChordBoardWorkspace(state.chordBoard);
```

Keep the existing Student08 shell/navigation.

In `renderAssignmentItem()`, CHORD_BOARD becomes actionable with the same `open-assignment` action/data attribute used by SCORE.

- [ ] **Step 8: Add minimal responsive CSS**

Add scoped classes only:

```css
.chord-board-workspace {
  min-width: 0;
}

.chord-diagram {
  width: min(100%, 24rem);
  overflow-x: auto;
}

.chord-string-list,
.chord-barre-list {
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .chord-board-workspace {
    padding-inline: var(--st-space-2);
  }
}
```

Do not change existing SCORE Practice layout in this task.

- [ ] **Step 9: Run focused UI/accessibility tests**

Run:

```bash
node --test   test/student08ChordBoardUi.test.js   test/student08MyWorkUi.test.js   test/student08ResponsiveAccessibility.test.js   test/student08Ui.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add   src/ui/chordBoardViewModel.js   src/ui/renderChordBoardWorkspace.js   src/ui/renderStudentApp.js   index.html   test/student08ChordBoardUi.test.js   test/student08MyWorkUi.test.js   test/student08ResponsiveAccessibility.test.js   test/student08Ui.test.js
git commit -m "feat: render accessible CHORD_BOARD workspace"
```

---

### Task 6: Authorized offline CHORD_BOARD package union

**Files:**
- Modify: `src/offline/offlineRecord.js`
- Modify: `src/offline/secureDeliveryOfflineReadService.js`
- Verify only: `src/offline/secureDeliveryStatusService.js` — Task 2's union-aware row validator should make CHORD_BOARD status work without product-code edits.
- Modify: `src/ui/student08Composition.js` — constructor/interface completeness must expose the new method through the selected online/offline read service.
- Create: `test/student08ChordBoardOffline.test.js`
- Modify: `test/secureDeliveryOfflineReadService.test.js`
- Modify: `test/student08OfflineOnlineRegressionMatrix.test.js`

**Interfaces:**
- Consumes:
  - Task 2 `restoreSecureDeliveryPackage()`
  - Task 3 `getChordBoardPracticeItem()`
  - existing `offlineRepository.putAuthorized()`
  - existing `offlineRepository.getActiveByAccessRef()`
- Produces:
  - `secureDeliveryOfflineReadService.getChordBoardPracticeItem()`
  - same outer offline-availability annotation used by SCORE.

- [ ] **Step 1: Write RED test that online CHORD_BOARD caches and warm offline same-student reopen works**

Use the real in-memory offline repository:

```js
const online = await service.getChordBoardPracticeItem({
  session: studentA,
  assignmentId: "assignment-chord-a",
});
assert.equal(online.offlineAvailability.source, "online");
assert.equal(online.offlineAvailability.deviceAvailable, true);

connectivity.emit(CONNECTIVITY_STATES.OFFLINE);

const offline = await service.getChordBoardPracticeItem({
  session: studentA,
  assignmentId: "assignment-chord-a",
});
assert.equal(offline.offlineAvailability.source, "offline");
assert.equal(offline.package.packageType, "CHORD_BOARD");
```

- [ ] **Step 2: Write RED cross-student and type-isolation tests**

After student A caches the CHORD_BOARD item:

```js
await assert.rejects(
  () =>
    service.getChordBoardPracticeItem({
      session: studentB,
      assignmentId: "assignment-chord-a",
    }),
  /offline practice unavailable/i,
);
```

Also pin:
- cached SCORE record cannot satisfy `getChordBoardPracticeItem()`;
- cached CHORD_BOARD record cannot satisfy `getScorePracticeItem()`.

- [ ] **Step 3: Write RED cache-save-failure and cold-offline tests**

Online repository write failure:

```js
const item = await service.getChordBoardPracticeItem(...);
assert.equal(item.offlineAvailability.deviceAvailable, false);
assert.equal(item.offlineAvailability.saveFailed, true);
assert.equal(item.package.packageType, "CHORD_BOARD");
```

Cold offline:
- no network call;
- bounded `offline practice unavailable`.

- [ ] **Step 4: Replace SCORE-only offline package eligibility with strict union eligibility**

In `offlineRecord.js`, do not call `assertPublishablePracticePackage()` blindly for Secure Delivery items.

Use:

```js
const pkg = restoreSecureDeliveryPackage({
  practiceType:
    practiceItem.package?.packageType === "CHORD_BOARD"
      ? PRACTICE_TYPES.CHORD_BOARD
      : PRACTICE_TYPES.SCORE,
  package: practiceItem.package,
});
```

However, do not trust package shape alone when the caller already knows assignment type. Prefer extending the practice item envelope in the read-service layer to carry an explicit normalized `practiceType`:

```js
{
  accessRef,
  practiceType: "SCORE" | "CHORD_BOARD",
  package
}
```

Then `offlineRecord.js` validates:

```js
const pkg = restoreSecureDeliveryPackage({
  practiceType: practiceItem.practiceType,
  package: practiceItem.package,
});
```

This is the plan’s chosen interface because it prevents type inference from untrusted package fields.

Task 3 already defines explicit `practiceType` in both return envelopes:
- SCORE method returns `practiceType: PRACTICE_TYPES.SCORE`;
- CHORD_BOARD method returns `practiceType: PRACTICE_TYPES.CHORD_BOARD`.

Store that explicit `practiceType` on the offline record so later type isolation is explicit.

- [ ] **Step 5: Extend offline record/repository compatibility without changing record key**

Record identity stays:

```text
studentId + SECURE_DELIVERY:deliveryId + packageId
```

Add only:

```js
practiceType: normalized.practiceType,
```

to the record.

Do not change the IndexedDB store name or primary key format.

Existing stored SCORE records without `practiceType` need a bounded compatibility rule in restore/read code:
- if legacy record package validates as SCORE and has no `packageType`, treat as SCORE;
- never infer CHORD_BOARD from symbol/content heuristics;
- all new writes include explicit `practiceType`.

Add a regression test using a legacy SCORE stored record fixture.

- [ ] **Step 6: Implement offline `getChordBoardPracticeItem()` mirroring SCORE while enforcing type**

Factor the duplicated SCORE/CHORD_BOARD cache/read flow into this private helper:

```js
async function getPrivatePracticeItem({
  session,
  assignmentId,
  expectedPracticeType,
  onlineMethod,
}) {
  // require current student
  // build exact SECURE_DELIVERY accessRef
  // offline: fetch ACTIVE student-scoped record and require exact practiceType
  // online: call onlineMethod, verify accessRef + practiceType, cache, annotate
}
```

Keep only type-specific public wrappers around this helper.

Offline return must check:

```js
if (record.practiceType !== expectedPracticeType) {
  throw new Error("offline practice unavailable");
}
```

Online return must check accessRef identity and `practiceType` before caching.

- [ ] **Step 7: Make constructor completeness require the new online method**

Update:

```js
typeof onlineReadService.getChordBoardPracticeItem !== "function"
```

in `createSecureDeliveryOfflineReadService()`.

Because `createStudent08Composition()` constructs the online service internally, no new external application configuration is required.

- [ ] **Step 8: Verify revocation/status path accepts CHORD_BOARD**

Existing `createSecureDeliveryStatusService()` should begin working after Task 2 because it calls the union-aware `createSecureDeliveryAssignmentRow()`.

Add/extend a test:

```js
assert.deepEqual(
  await statusService.getAccessStatus({
    accessRef: {
      kind: "SECURE_DELIVERY",
      deliveryId: "assignment-chord-a",
    },
  }),
  {
    state: "ACTIVE",
    packageId: "assignment-chord-a",
  },
);
```

Keep exact 404 `NOT_FOUND` -> `REVOKED`; transient failures still throw.

- [ ] **Step 9: Extend offline/online regression matrix**

Add CHORD_BOARD rows for:
- warm online -> offline;
- cold offline;
- cache-save failure;
- reconnect sync;
- revoked cached record;
- cross-student denial.

Do not remove existing SCORE rows.

- [ ] **Step 10: Run focused offline tests**

Run:

```bash
node --test   test/student08ChordBoardOffline.test.js   test/secureDeliveryOfflineReadService.test.js   test/student08OfflineOnlineRegressionMatrix.test.js   test/offlineSync.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add   src/offline/offlineRecord.js   src/offline/secureDeliveryOfflineReadService.js   src/offline/secureDeliveryStatusService.js   src/ui/student08Composition.js   src/sharing/secureDeliveryStudent08ReadService.js   test/student08ChordBoardOffline.test.js   test/secureDeliveryOfflineReadService.test.js   test/student08OfflineOnlineRegressionMatrix.test.js
git commit -m "feat: cache CHORD_BOARD assignments offline safely"
```

---

### Task 7: Full regression, architecture reality update, and merge-ready evidence

**Files:**
- Modify: `docs/architecture.md`
- Do not modify `README.md` in this plan; its current high-level capability text does not need CHORD_BOARD detail for correctness.
- No product behavior changes unless a failing verification proves a scoped defect.

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: exact-head automated evidence and physical acceptance checklist; no merge.

- [ ] **Step 1: Fresh-read the final feature branch against current `main`**

Record:
- feature head SHA;
- current main SHA;
- compare status;
- ahead/behind counts;
- changed file list;
- open/unresolved review threads.

If `behind_by > 0`, resolve drift before claiming merge-ready and rerun all checks.

- [ ] **Step 2: Run all focused CHORD_BOARD tests**

```bash
node --test   test/studentChordBoardPackage.test.js   test/student08ChordBoardReadService.test.js   test/student08ChordBoardController.test.js   test/student08ChordBoardUi.test.js   test/student08ChordBoardOffline.test.js
```

Expected: 0 failures.

- [ ] **Step 3: Run SCORE Secure Delivery regressions**

```bash
node --test   test/student08SecureDeliveryContracts.test.js   test/secureDeliveryStudent08ReadService.test.js   test/secureDeliveryOfflineReadService.test.js   test/student08Ui.test.js   test/practiceNotationLifecycle.test.js
```

Expected: 0 failures and no intentional SCORE expectation changes beyond shared union compatibility.

- [ ] **Step 4: Run offline/responsive/accessibility regressions**

```bash
node --test   test/student08OfflineOnlineRegressionMatrix.test.js   test/student08ResponsiveAccessibility.test.js   test/student08MyWorkUi.test.js   test/student08MobileSidebarPractice.test.js
```

Expected: 0 failures.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: all tests PASS. Record exact count rather than assuming the pre-feature `414` count.

- [ ] **Step 6: Run deterministic generated-asset and whitespace gates**

```bash
node scripts/generate-st-piano-bank.mjs
git diff --exit-code -- vendor/st-piano
git diff --check
```

Expected: zero generated diff and zero whitespace errors.

- [ ] **Step 7: Update architecture docs to production-code reality**

Add a bounded CHORD_BOARD section documenting:
- strict Secure Delivery union boundary;
- dedicated `CHORD_BOARD` screen;
- exact immutable voicing authority;
- no MusicXML/SCORE Practice crossover;
- IndexedDB private offline package union;
- Service Worker private-data boundary unchanged;
- revocation/session isolation;
- no chord audio/playback.

Do not update historical claims unrelated to this feature.

- [ ] **Step 8: Commit documentation reality update**

```bash
git add docs/architecture.md
git commit -m "docs: document Student CHORD_BOARD consumer"
```

- [ ] **Step 9: Push final branch and require exact-head CI**

GitHub Actions must run:
- Node 24;
- `npm ci --ignore-scripts`;
- `npm test`;
- deterministic piano-bank regeneration/diff;
- `git diff --check`.

Record exact workflow run ID and conclusion.

Expected: `SUCCESS`.

- [ ] **Step 10: Require Sonar Quality Gate on the exact head**

Record:
- Quality Gate PASS;
- new issues count;
- accepted issues count;
- security hotspots count;
- new-code duplication/coverage as reported.

Do not treat an earlier commit’s Sonar result as final evidence.

- [ ] **Step 11: Prepare, but do not execute without separate approval, the physical iPhone/Safari/VoiceOver checklist**

Checklist:

1. My Work shows a CHORD_BOARD card as “Akor çalışması”.
2. Tapping it opens the dedicated chord workspace, not Nota Practice.
3. Chord symbol/title matches the assignment.
4. Six strings match exact package frets.
5. Muted/open/fretted states are visually distinct.
6. Finger numbers match the exact package.
7. Barre geometry matches exact `finger/fret/fromString/toString`.
8. Teacher note is visible.
9. VoiceOver announces chord identity.
10. VoiceOver can read each string’s number/state/fret/finger.
11. VoiceOver can read each barre.
12. Orientation change keeps the same chord state.
13. Previously cached authorized CHORD_BOARD reopens offline.
14. Reconnect does not substitute another voicing.
15. SCORE assignment still opens existing Nota Practice unchanged.

Preview deployment is a separate explicit human gate. Do not deploy merely to complete this task.

- [ ] **Step 12: Final merge-ready report and STOP**

Report exactly:
- final feature head SHA;
- base main SHA;
- changed files;
- focused test counts;
- full test count;
- exact-head CI run/result;
- Sonar result;
- base drift;
- unresolved review threads;
- security review summary;
- physical acceptance status;
- deployment status;
- `MERGE-READY / NOT MERGED` or `BLOCKED`.

Do not merge until explicit human merge approval.

