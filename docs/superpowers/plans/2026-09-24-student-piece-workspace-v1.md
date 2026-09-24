# ST Piece Workspace V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce authoritative Piece-level grouping so a student opens one musical work such as Cambaz and switches safely between Nota and Akorlar in one focus-mode workspace, while preserving legacy SCORE/CHORD_BOARD flows and preparing—not implementing—the future TAB view.

**Architecture:** Implementation is split into two separately reviewable workstreams. Workstream A adds Piece authority to `khfy7wpr5p-maker/seslitab-guitar-reader` Secure Delivery without changing child SCORE/CHORD_BOARD package contracts. Workstream B consumes that authority in `khfy7wpr5p-maker/st-student-app`, keeps child package validation independent, reuses existing SCORE/CHORD_BOARD renderers, and adds an authenticated Piece manifest cache in the same IndexedDB database but a separate object store.

**Tech Stack:** Node.js ESM, `node:test`, Express, Firebase/Firestore Secure Delivery backend, browser Fetch API, IndexedDB/`fake-indexeddb`, existing Student App notation/playback/chord renderers.

**Spec:** `docs/superpowers/specs/2026-09-24-student-piece-workspace-design.md`

## Global Constraints

- Piece membership is authority-driven by `pieceAssignmentId`, `pieceId`, `arrangementId`, and exact child assignment IDs; never group by title.
- Piece lifecycle `ACTIVE | COMPLETED | REPERTOIRE` controls the student's folder placement.
- SCORE and CHORD_BOARD remain independently validated Secure Delivery children.
- V1 does not define, fabricate, or render TAB; no TAB tab appears without a future real TAB contract.
- Existing legacy independent SCORE and CHORD_BOARD assignments must continue to open through their current flows.
- `Nota → Akorlar → Nota` must preserve the exact active `#st-score-root` DOM object.
- Switching away from Nota pauses hidden playback without disposing the active SCORE package or notation solely because Akorlar is selected.
- Private Piece manifests and child packages remain outside Service Worker Cache Storage.
- Offline Piece metadata is scoped by authenticated local student and may not authorize absent, wrong-type, cross-student, or revoked child packages.
- A child failure is isolated when another Piece view remains valid.
- No production Firebase rules/configuration, production deploy, merge, or cross-repo product write occurs without its explicit human gate.
- Physical iPhone/Safari acceptance is required before merge-ready status.
- Do not use `design/piece-workspace-architecture` as an implicit production implementation base. Fresh-read and branch explicitly before coding in each repo.

## Review Focus

1. **Same title, different identity:** two “Cambaz” pieces with different `pieceId`/`arrangementId` remain separate and never share children.
2. **Child authority mismatch:** wrong-student, wrong-type, unknown, duplicate, or unlisted child assignment IDs fail closed without leaking ownership.
3. **Race/revocation:** stale session/Piece responses and revoked Piece/child records cannot re-enter the current workspace or offline ACTIVE set.
4. **Notation lifecycle:** repeated `Nota → Akorlar → Nota` keeps the exact same score-root DOM node and pauses hidden playback instead of tearing notation down.
5. **Partial offline availability:** a cached SCORE with missing chord cache still opens Nota; a cached chord set with missing SCORE still opens Akorlar; zero usable views fails boundedly.

---

# Workstream A — SesliTab / Secure Delivery Piece Authority

Implementation repository: `khfy7wpr5p-maker/seslitab-guitar-reader`  
Branch rule: create a dedicated Piece branch from fresh current `main`. Do not reuse a Student App branch.  
Merge rule: keep the producer PR unmerged until its exact-head CI/Sonar/security checks pass and human merge approval is explicit.

### Task 1: PieceAssignmentV1 and Piece lifecycle contracts

**Files:**
- Create: `src/services/pieceAssignment.js`
- Create: `src/services/pieceAssignmentLifecycleRecord.js`
- Test: `tests/pieceAssignment.test.js`
- Test: `tests/pieceAssignmentLifecycleRecord.test.js`

**Interfaces:**
- Consumes: existing `normalizeRequiredId()`, `normalizeRequiredText()`, `normalizeOptionalText()`, `normalizeRequiredTimestamp()` from `src/services/teacherDeliveryContractValidation.js`.
- Produces:
  - `createPieceAssignment(input)`
  - `isPieceAssignment(value)`
  - `PIECE_ASSIGNMENT_STATE`
  - `createInitialPieceLifecycleRecord(piece)`
  - `transitionPieceLifecycleRecord(record, toState, transitionedAt)`
  - `revokePieceLifecycleRecord(record, revokedAt)`

- [ ] **Step 1: Write failing Piece contract tests**

Add tests covering strict fields, same-title/different-ID separation, duplicate child IDs, zero children, invalid lifecycle values, and immutable output.

```js
test('PieceAssignmentV1 keeps title separate from authority identity', () => {
  const a = createPieceAssignment({
    pieceAssignmentId: 'piece-assignment-a',
    pieceId: 'piece-cambaz-a',
    arrangementId: 'arr-cambaz-a',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: '',
    assignedAt: '2026-09-24T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: ['chord-a', 'chord-b'],
    },
  })
  const b = createPieceAssignment({
    pieceAssignmentId: 'piece-assignment-b',
    pieceId: 'piece-cambaz-b',
    arrangementId: 'arr-cambaz-b',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: '',
    assignedAt: '2026-09-24T08:01:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-b',
      chordAssignmentIds: [],
    },
  })

  assert.notEqual(a.pieceId, b.pieceId)
  assert.equal(a.title, b.title)
  assert.equal(Object.isFrozen(a.contentRefs), true)
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/pieceAssignment.test.js tests/pieceAssignmentLifecycleRecord.test.js
```

Expected: FAIL because the Piece modules do not exist.

- [ ] **Step 3: Implement strict Piece contract and lifecycle**

Use exact input/record fields. V1 contains SCORE + CHORD refs only.

```js
export const PIECE_ASSIGNMENT_SCHEMA_VERSION = '1.0.0'

export const PIECE_ASSIGNMENT_STATE = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  REPERTOIRE: 'REPERTOIRE',
})

export function createPieceAssignment(input = {}) {
  assertStrictInputObject(input, [
    'pieceAssignmentId',
    'pieceId',
    'arrangementId',
    'studentId',
    'title',
    'teacherNote',
    'assignedAt',
    'contentRefs',
  ], 'PieceAssignment')

  const scoreAssignmentId =
    input.contentRefs?.scoreAssignmentId === null
      ? null
      : normalizeRequiredId(
          input.contentRefs?.scoreAssignmentId,
          'contentRefs.scoreAssignmentId',
        )

  const chordAssignmentIds = Object.freeze(
    (input.contentRefs?.chordAssignmentIds ?? [])
      .map((id) => normalizeRequiredId(id, 'contentRefs.chordAssignmentIds[]')),
  )

  if (new Set(chordAssignmentIds).size !== chordAssignmentIds.length) {
    throw new Error('duplicate Piece chord assignment authority')
  }
  if (scoreAssignmentId === null && chordAssignmentIds.length === 0) {
    throw new Error('Piece must reference at least one supported child')
  }

  return Object.freeze({
    schemaVersion: PIECE_ASSIGNMENT_SCHEMA_VERSION,
    pieceAssignmentId: normalizeRequiredId(input.pieceAssignmentId, 'pieceAssignmentId'),
    pieceId: normalizeRequiredId(input.pieceId, 'pieceId'),
    arrangementId: normalizeRequiredId(input.arrangementId, 'arrangementId'),
    studentId: normalizeRequiredId(input.studentId, 'studentId'),
    title: normalizeRequiredText(input.title, 'title', 160),
    teacherNote: normalizeOptionalText(input.teacherNote, 'teacherNote', 2000),
    state: PIECE_ASSIGNMENT_STATE.ACTIVE,
    assignedAt: normalizeRequiredTimestamp(input.assignedAt, 'assignedAt'),
    revokedAt: null,
    contentRefs: Object.freeze({ scoreAssignmentId, chordAssignmentIds }),
  })
}
```

Implement lifecycle transitions exactly `ACTIVE → COMPLETED → REPERTOIRE`; idempotent same-state returns current; revoked records cannot transition.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/pieceAssignment.js src/services/pieceAssignmentLifecycleRecord.js tests/pieceAssignment.test.js tests/pieceAssignmentLifecycleRecord.test.js
git commit -m "feat: add Piece assignment authority contracts"
```

### Task 2: Persist Piece authority independently from child packages

**Files:**
- Modify: `backend/delivery/repositories/secureDeliveryStore.js`
- Modify: `backend/delivery/repositories/inMemorySecureDeliveryStore.js`
- Modify: `backend/delivery/firebase/firestoreSecureDeliveryStore.js`
- Modify: `firestore.rules` only if server-owned collection access must be explicitly denied to clients; do not grant direct student/teacher client access.
- Test: `tests/inMemorySecureDeliveryStore.test.js`
- Test: `tests/secureDeliveryFirebaseEmulator.test.js`
- Test: `tests/secureDeliveryFirestoreRules.test.js`

**Interfaces:**
- Produces store methods:
  - `getPieceAssignment(pieceAssignmentId)`
  - `getPieceLifecycle(pieceAssignmentId)`
  - `listPieceAssignmentsForStudent(studentId)`
  - `putPieceAssignment(pieceAssignment)`
  - `commitPieceLifecycleMutation({ currentLifecycle, nextLifecycle })`

- [ ] **Step 1: Write failing repository tests**

Pin student scoping, exact identity, immutable overwrite conflict, lifecycle persistence, and duplicate Piece IDs.

```js
const saved = await store.putPieceAssignment(piece)
assert.equal(
  (await store.getPieceAssignment('piece-assignment-a')).pieceId,
  'piece-cambaz-a',
)
assert.deepEqual(
  await store.listPieceAssignmentsForStudent('student-b'),
  Object.freeze([]),
)
await assert.rejects(
  () => store.putPieceAssignment({
    ...piece,
    title: 'same identity changed payload',
  }),
  /conflict|immutable/i,
)
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/inMemorySecureDeliveryStore.test.js tests/secureDeliveryFirebaseEmulator.test.js tests/secureDeliveryFirestoreRules.test.js
```

- [ ] **Step 3: Implement store methods**

Keep Piece records in dedicated server collections/maps, not mixed with practice package storage.

Recommended Firestore collection names:

```text
pieceAssignments/{pieceAssignmentId}
pieceAssignmentLifecycle/{pieceAssignmentId}
```

The server store validates every read/write with `isPieceAssignment()` / lifecycle validator before returning it.

- [ ] **Step 4: Verify GREEN plus existing store regression**

```bash
node --test tests/inMemorySecureDeliveryStore.test.js tests/secureDeliveryFirebaseEmulator.test.js tests/secureDeliveryFirestoreRules.test.js tests/secureDeliverySecurity.test.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/delivery/repositories/secureDeliveryStore.js backend/delivery/repositories/inMemorySecureDeliveryStore.js backend/delivery/firebase/firestoreSecureDeliveryStore.js firestore.rules tests/inMemorySecureDeliveryStore.test.js tests/secureDeliveryFirebaseEmulator.test.js tests/secureDeliveryFirestoreRules.test.js
git commit -m "feat: persist Piece authority in Secure Delivery"
```

### Task 3: Teacher Piece service validates child assignment authority

**Files:**
- Create: `backend/delivery/services/teacherPieceService.js`
- Test: `tests/teacherPieceService.test.js`

**Interfaces:**
- Consumes:
  - `authorization.resolvePrincipal(providerSubject, 'TEACHER')`
  - store child methods `getDelivery()`, `getPreparedAssignment()`
  - Piece store methods from Task 2.
- Produces:
  - `createPiece({ providerSubject, input })`
  - `applyPieceAction({ providerSubject, pieceAssignmentId, action })`

- [ ] **Step 1: Write failing child-authority tests**

Required cases:
- every child exists and is active;
- all children belong to the same target student;
- all children were delivered by the current teacher authority;
- SCORE ref resolves only SCORE;
- every chord ref resolves only CHORD_BOARD;
- duplicate child refs fail;
- another teacher's or student's child fails without owner leakage;
- COMPLETE, MOVE_TO_REPERTOIRE and REVOKE mutate Piece lifecycle only.

```js
await assert.rejects(
  () => service.createPiece({
    providerSubject: 'uid-teacher-a',
    input: {
      pieceAssignmentId: 'piece-a',
      pieceId: 'work-a',
      arrangementId: 'arr-a',
      studentId: 'student-a',
      title: 'Cambaz',
      teacherNote: '',
      scoreAssignmentId: 'assignment-owned-by-student-b',
      chordAssignmentIds: [],
    },
  }),
  /piece-child-authority-mismatch/i,
)
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/teacherPieceService.test.js
```

- [ ] **Step 3: Implement minimal service**

Centralize child verification:

```js
async function requireChild({
  assignmentId,
  expectedPracticeType,
  teacherId,
  studentId,
}) {
  const delivery = await store.getDelivery(assignmentId)
  if (
    delivery === null ||
    delivery.revokedAt !== null ||
    delivery.teacherId !== teacherId ||
    delivery.studentId !== studentId
  ) {
    throw new Error('piece-child-authority-mismatch')
  }

  const prepared = await store.getPreparedAssignment(assignmentId)
  if (
    prepared?.assignment?.assignmentId !== assignmentId ||
    prepared.assignment.studentId !== studentId ||
    prepared.assignment.practiceType !== expectedPracticeType
  ) {
    throw new Error('piece-child-authority-mismatch')
  }

  return prepared.assignment
}
```

Only after every child passes does `createPiece()` call `putPieceAssignment()`.

- [ ] **Step 4: Verify GREEN**

Run focused tests plus `tests/secureDeliveryChordBoardIntegration.test.js` and `tests/studentDeliveryReadService.test.js`.

- [ ] **Step 5: Commit**

```bash
git add backend/delivery/services/teacherPieceService.js tests/teacherPieceService.test.js
git commit -m "feat: validate Piece child assignment authority"
```

### Task 4: Expose bounded teacher/student Piece HTTP API

**Files:**
- Modify: `backend/delivery/services/studentDeliveryReadService.js`
- Modify: `backend/delivery/http/router.js`
- Test: `tests/studentDeliveryReadService.test.js`
- Test: `tests/secureDeliveryHttp.test.js`
- Modify composition/bootstrap file that currently constructs `createSecureDeliveryRouter()` so `teacherPieceService` is injected; use the actual fresh-read composition path discovered at implementation time and record it in the PR.

**Interfaces:**
- Student service produces:
  - `listPieces({ providerSubject })`
  - `getPiece({ providerSubject, pieceAssignmentId })`
- HTTP:
  - `POST /api/secure-delivery/v1/teacher/pieces`
  - `POST /api/secure-delivery/v1/teacher/pieces/:pieceAssignmentId/actions`
  - `GET /api/secure-delivery/v1/student/pieces`
  - `GET /api/secure-delivery/v1/student/pieces/:pieceAssignmentId`

- [ ] **Step 1: Write failing read/HTTP tests**

Student Piece view must exclude `studentId`, `teacherId`, provider identity, and child package payloads.

```js
assert.deepEqual(Object.keys(piece).sort(), [
  'arrangementId',
  'assignedAt',
  'contentRefs',
  'pieceAssignmentId',
  'pieceId',
  'schemaVersion',
  'state',
  'teacherNote',
  'title',
])

assert.deepEqual(piece.contentRefs, {
  scoreAssignmentId: 'score-a',
  chordAssignmentIds: ['chord-a', 'chord-b'],
})
```

A student requesting another student's exact `pieceAssignmentId` must receive bounded not-found/forbidden semantics without owner IDs in the message.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/studentDeliveryReadService.test.js tests/secureDeliveryHttp.test.js
```

- [ ] **Step 3: Implement bounded Piece projection and routes**

Projection:

```js
function studentPieceView(piece, lifecycle) {
  return Object.freeze({
    schemaVersion: '1.0.0',
    pieceAssignmentId: piece.pieceAssignmentId,
    pieceId: piece.pieceId,
    arrangementId: piece.arrangementId,
    title: piece.title,
    teacherNote: piece.teacherNote,
    state: lifecycle?.state ?? piece.state,
    assignedAt: piece.assignedAt,
    contentRefs: piece.contentRefs,
  })
}
```

Do not include child packages in Piece endpoints; Student App resolves children through existing assignment endpoints after validating the manifest.

- [ ] **Step 4: Verify producer workstream GREEN**

Run:

```bash
node --test tests/pieceAssignment.test.js tests/pieceAssignmentLifecycleRecord.test.js tests/teacherPieceService.test.js tests/studentDeliveryReadService.test.js tests/secureDeliveryHttp.test.js tests/secureDeliverySecurity.test.js tests/secureDeliveryChordBoardIntegration.test.js
npm test
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Commit and stop at producer human gate**

```bash
git add backend/delivery/services/studentDeliveryReadService.js backend/delivery/http/router.js tests/studentDeliveryReadService.test.js tests/secureDeliveryHttp.test.js
git commit -m "feat: expose Secure Delivery Piece authority"
```

Open a producer PR. Do not merge or production-deploy. Record exact head SHA, test counts, CI/Sonar/security status, and API contract. Student Workstream B may use an explicitly approved stacked/test backend branch, but production merge remains a separate gate.

---

# Workstream B — Student App Piece Workspace Consumer

Implementation repository: `khfy7wpr5p-maker/st-student-app`  
Branch rule: fresh-read current `main` after CHORD_BOARD prerequisite is merged, or create an explicitly approved stacked branch on the verified CHORD_BOARD head. Never start product code from the docs-only design branch.

### Task 5: Add strict Student Piece manifest contract and API client

**Files:**
- Create: `src/contracts/pieceAssignment.js`
- Modify: `src/providers/secureDelivery/secureDeliveryApiClient.js`
- Test: `test/pieceAssignment.test.js`
- Test: `test/secureDeliveryApiClient.test.js`

**Interfaces:**
- Produces:
  - `createStudentPieceManifest(raw)`
  - `listStudentPieces()`
  - `getStudentPiece(pieceAssignmentId)`

- [ ] **Step 1: Write failing strict-contract/API tests**

```js
const piece = createStudentPieceManifest({
  schemaVersion: '1.0.0',
  pieceAssignmentId: 'piece-a',
  pieceId: 'work-a',
  arrangementId: 'arr-a',
  title: 'Cambaz',
  teacherNote: '',
  state: 'ACTIVE',
  assignedAt: '2026-09-24T08:00:00Z',
  contentRefs: {
    scoreAssignmentId: 'score-a',
    chordAssignmentIds: ['chord-a'],
  },
})
assert.equal(Object.isFrozen(piece.contentRefs.chordAssignmentIds), true)
assert.throws(
  () => createStudentPieceManifest({ ...piece, studentId: 'leak' }),
  /unsupported/i,
)
```

API methods must call exactly `student/pieces` and `student/pieces/:id` with the existing bearer-token/error behavior.

- [ ] **Step 2: Verify RED**

```bash
node --test test/pieceAssignment.test.js test/secureDeliveryApiClient.test.js
```

- [ ] **Step 3: Implement strict manifest and API methods**

Do not add TAB fields to V1.

- [ ] **Step 4: Verify GREEN**

Run focused tests.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/pieceAssignment.js src/providers/secureDelivery/secureDeliveryApiClient.js test/pieceAssignment.test.js test/secureDeliveryApiClient.test.js
git commit -m "feat: add Student Piece manifest contract"
```

### Task 6: Add Piece read service with exact child resolution

**Files:**
- Modify: `src/sharing/secureDeliveryStudent08ReadService.js`
- Modify: `src/ui/student08Composition.js`
- Test: `test/secureDeliveryStudent08ReadService.test.js`
- Test: `test/student08SecureDeliveryComposition.test.js`
- Create support fixture if needed: `test/support/pieceFixtures.js`

**Interfaces:**
- Add:
  - `listPieces({ session, state })`
  - `getPiece({ session, pieceAssignmentId })`
  - `getPieceScoreItem({ session, pieceAssignmentId })`
  - `listPieceChordItems({ session, pieceAssignmentId })`

- [ ] **Step 1: Write failing authority tests**

Required:
- same-title Piece IDs stay separate;
- state filter uses Piece state;
- score child must be manifest-listed and SCORE;
- every chord child must be manifest-listed and CHORD_BOARD;
- cross-student/wrong type/identity mismatch fails;
- no child fallback by title.

```js
const chords = await service.listPieceChordItems({
  session,
  pieceAssignmentId: 'piece-a',
})
assert.deepEqual(
  chords.map((item) => item.accessRef.deliveryId),
  ['chord-a', 'chord-b'],
)
assert.equal(scoreCalls.includes('chord-a'), false)
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/secureDeliveryStudent08ReadService.test.js test/student08SecureDeliveryComposition.test.js
```

- [ ] **Step 3: Implement Piece child resolution**

Use manifest child IDs as the sole join key:

```js
async function getPieceScoreItem({ session, pieceAssignmentId }) {
  const piece = await getPiece({ session, pieceAssignmentId })
  const assignmentId = piece.contentRefs.scoreAssignmentId
  if (assignmentId === null) {
    throw new Error('piece score unavailable')
  }
  return getScorePracticeItem({ session, assignmentId })
}
```

`listPieceChordItems()` maps exact manifest IDs through `getChordBoardPracticeItem()`; it must not query/search by chord symbol/title.

- [ ] **Step 4: Verify GREEN plus existing SCORE/CHORD read regressions**

```bash
node --test test/secureDeliveryStudent08ReadService.test.js test/student08ChordBoardReadService.test.js test/student08ReadService.test.js test/student08SecureDeliveryComposition.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/sharing/secureDeliveryStudent08ReadService.js src/ui/student08Composition.js test/secureDeliveryStudent08ReadService.test.js test/student08SecureDeliveryComposition.test.js test/support/pieceFixtures.js
git commit -m "feat: resolve authorized Piece children"
```

### Task 7: Cache Piece manifests in the same IndexedDB database, separate store

**Files:**
- Create: `src/offline/pieceOfflineRecord.js`
- Modify: `src/offline/indexedDbOfflineRepository.js`
- Modify: `src/offline/inMemoryOfflineRepository.js`
- Modify: `src/offline/secureDeliveryOfflineReadService.js`
- Test: `test/indexedDbOfflineRepository.test.js`
- Test: `test/inMemoryOfflineRepository.test.js`
- Test: `test/secureDeliveryOfflineReadService.test.js`
- Test: `test/student08OfflineOnlineRegressionMatrix.test.js`

**Interfaces:**
- Repository adds:
  - `putPieceManifest({ studentId, piece, cachedAt, lastVerifiedAt })`
  - `getActivePieceManifest({ studentId, pieceAssignmentId })`
  - `listActivePieceManifests({ studentId, state })`
  - `markPieceManifestRevoked({ studentId, pieceAssignmentId, lastVerifiedAt })`

- [ ] **Step 1: Write failing DB migration/isolation tests**

Bump DB version additively from 2 to 3 and add a `pieceManifests` store. Existing `practicePackages` records must remain readable.

```js
const first = createIndexedDbOfflineRepository({ indexedDB, dbName })
await first.putPieceManifest({
  studentId: 'student-a',
  piece,
  cachedAt: '2026-09-24T09:00:00Z',
  lastVerifiedAt: '2026-09-24T09:00:00Z',
})

const reopened = createIndexedDbOfflineRepository({ indexedDB, dbName })
assert.equal(
  (await reopened.getActivePieceManifest({
    studentId: 'student-a',
    pieceAssignmentId: 'piece-a',
  })).pieceId,
  'work-a',
)
assert.equal(
  await reopened.getActivePieceManifest({
    studentId: 'student-b',
    pieceAssignmentId: 'piece-a',
  }),
  null,
)
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/indexedDbOfflineRepository.test.js test/inMemoryOfflineRepository.test.js test/secureDeliveryOfflineReadService.test.js
```

- [ ] **Step 3: Implement additive manifest store and offline Piece methods**

Keep `practicePackages` unchanged. Add:

```js
const PIECE_STORE_NAME = 'pieceManifests'
const PIECE_DB_VERSION = 3

function pieceCacheKey(studentId, pieceAssignmentId) {
  return `${studentId}\u0000${pieceAssignmentId}`
}
```

Online `listPieces/getPiece` caches manifests. Offline reads use only same-student ACTIVE manifest. Child methods still resolve through existing package repository and practice type checks.

A missing cached child returns a view-local unavailable condition; it does not create a fake package.

- [ ] **Step 4: Verify GREEN plus legacy DB migration**

Run all four focused files. Explicitly keep existing v1/v2 package migration tests green.

- [ ] **Step 5: Commit**

```bash
git add src/offline/pieceOfflineRecord.js src/offline/indexedDbOfflineRepository.js src/offline/inMemoryOfflineRepository.js src/offline/secureDeliveryOfflineReadService.js test/indexedDbOfflineRepository.test.js test/inMemoryOfflineRepository.test.js test/secureDeliveryOfflineReadService.test.js test/student08OfflineOnlineRegressionMatrix.test.js
git commit -m "feat: cache authorized Piece manifests offline"
```

### Task 8: Introduce Piece Workspace controller state and legacy compatibility

**Files:**
- Create: `src/ui/pieceWorkspaceViewModel.js`
- Modify: `src/ui/studentAppController.js`
- Modify: `src/ui/shellActions.js`
- Test: `test/studentPieceWorkspaceController.test.js`
- Test: `test/shellActions.test.js`
- Keep existing: `test/student08ChordBoardController.test.js`, SCORE controller tests.

**Interfaces:**
- Add screen: `PIECE_WORKSPACE`
- Add controller methods:
  - `openPiece(pieceAssignmentId, returnContext)`
  - `selectPieceView(view)`
  - `selectPieceChord(assignmentId)`
  - `backFromPiece()`
- Piece views: `SCORE`, `CHORDS`; no TAB enum in V1 unless represented only as future documentation, not runtime availability.

- [ ] **Step 1: Write failing controller tests**

Required state flow:

```js
await controller.showMyWork('ACTIVE')
await controller.openPiece('piece-a', {
  folderState: 'ACTIVE',
  scrollPosition: 420,
})
assert.equal(controller.getState().screen, 'piece_workspace')
assert.equal(controller.getState().pieceWorkspace.selectedView, 'SCORE')

controller.selectPieceView('CHORDS')
assert.equal(controller.getState().pieceWorkspace.selectedView, 'CHORDS')

controller.backFromPiece()
assert.equal(controller.getState().screen, 'my_work')
assert.deepEqual(controller.getState().returnContext, {
  folderState: 'ACTIVE',
  scrollPosition: 420,
})
```

Also assert:
- legacy `openAssignment()` still opens SCORE/CHORD_BOARD;
- Piece open never groups legacy items;
- stale prior-session Piece response ignored;
- sign-out clears Piece state.

- [ ] **Step 2: Verify RED**

```bash
node --test test/studentPieceWorkspaceController.test.js test/student08ChordBoardController.test.js test/shellActions.test.js
```

- [ ] **Step 3: Implement Piece state without rewriting existing Practice/Chord activation**

The Piece controller may internally hold:
- active Piece manifest;
- active SCORE practice package/render source;
- chord view models[];
- selected chord assignment;
- return context.

Do not clear SCORE notation/package merely because selected Piece view becomes CHORDS.

- [ ] **Step 4: Verify GREEN**

Run focused tests plus existing SCORE/CHORD controller tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pieceWorkspaceViewModel.js src/ui/studentAppController.js src/ui/shellActions.js test/studentPieceWorkspaceController.test.js test/shellActions.test.js
git commit -m "feat: add Piece Workspace controller state"
```

### Task 9: Render Piece cards, separate folders, focus-mode workspace, and explicit back

**Files:**
- Create: `src/ui/renderPieceWorkspace.js`
- Modify: `src/ui/renderStudentApp.js`
- Modify: `index.html`
- Test: `test/studentPieceWorkspaceUi.test.js`
- Modify: `test/student08MyWorkUi.test.js`
- Modify: `test/student08ResponsiveAccessibility.test.js`
- Modify: `test/student08MobileNavigation.test.js`

**Interfaces:**
- `renderPieceWorkspace(pieceWorkspace)`
- Actions:
  - `open-piece`
  - `select-piece-view`
  - `select-piece-chord`
  - `back-from-piece`

- [ ] **Step 1: Write failing UI tests**

Pin:
- My Work shows one Piece card for Cambaz, not its child SCORE/chord cards;
- legacy cards still render separately;
- Piece Workspace does not render wide sidebar;
- visible `← Geri`;
- capability-driven `Nota`/`Akorlar`;
- no TAB button;
- Piece title heading;
- compact mobile selector;
- Completed/Repertoire navigation exists outside workspace.

```js
assert.match(html, /data-action="back-from-piece"[^>]*>\s*←\s*Geri/)
assert.match(html, /data-piece-view="SCORE"[^>]*>Nota/)
assert.match(html, /data-piece-view="CHORDS"[^>]*>Akorlar/)
assert.doesNotMatch(html, />TAB</)
assert.doesNotMatch(html, /student-navigation/)
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/studentPieceWorkspaceUi.test.js test/student08MyWorkUi.test.js test/student08ResponsiveAccessibility.test.js test/student08MobileNavigation.test.js
```

- [ ] **Step 3: Implement focus-mode UI**

Use one workspace shell:

```html
<section class="piece-workspace" aria-labelledby="piece-title">
  <header class="piece-workspace-header">
    <button type="button" data-action="back-from-piece">← Geri</button>
    <h1 id="piece-title">Cambaz</h1>
  </header>
  <div class="piece-view-selector" role="tablist" aria-label="Çalışma görünümü">
    ...
  </div>
  <div class="piece-view-content">...</div>
</section>
```

Keep folder buttons/cards outside this shell so they cannot consume notation width.

- [ ] **Step 4: Verify GREEN**

Run focused UI/accessibility/mobile tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/renderPieceWorkspace.js src/ui/renderStudentApp.js index.html test/studentPieceWorkspaceUi.test.js test/student08MyWorkUi.test.js test/student08ResponsiveAccessibility.test.js test/student08MobileNavigation.test.js
git commit -m "feat: add mobile Piece Workspace shell"
```

### Task 10: Preserve notation DOM and pause playback across Piece view switches

**Files:**
- Modify: `src/ui/mountStudentApp.js`
- Modify: `src/ui/studentAppController.js` only for a bounded pause-on-view-switch hook if required.
- Test: `test/studentPieceWorkspaceMount.test.js`
- Modify: `test/student08Focus.test.js`
- Modify: `test/studentPlaybackLifecycle.test.js`

**Interfaces:**
- Presentation key for Piece SCORE must include Piece identity and SCORE package identity without changing when selected view flips between SCORE and CHORDS.
- The persistent notation root remains owned by the active Piece until Piece exit/change/sign-out.

- [ ] **Step 1: Write failing physical-regression-equivalent DOM tests**

Use a fake DOM root and notation adapter to prove object identity:

```js
const first = root.querySelector('#st-score-root')
await click('[data-piece-view="CHORDS"]')
await click('[data-piece-view="SCORE"]')
const second = root.querySelector('#st-score-root')

assert.equal(second, first)
assert.equal(notationAdapter.disposeCalls, 0)
assert.equal(playbackPort.pauseCalls, 1)
```

On `back-from-piece`, Piece change, or sign-out, disposal is allowed/required by existing ownership rules.

- [ ] **Step 2: Verify RED**

```bash
node --test test/studentPieceWorkspaceMount.test.js test/student08Focus.test.js test/studentPlaybackLifecycle.test.js
```

- [ ] **Step 3: Implement persistent Piece presentation key and hidden SCORE panel**

Recommended key logic:

```js
function notationPresentationKey(state) {
  if (
    state.screen === STUDENT_APP_SCREENS.PIECE_WORKSPACE &&
    state.pieceWorkspace?.score?.practice
  ) {
    return `piece:${state.pieceWorkspace.pieceAssignmentId}:score:${state.pieceWorkspace.score.practice.packageId}`
  }
  // preserve existing legacy PRACTICE key logic
}
```

Do not call notation disposal merely because `selectedView === 'CHORDS'`. Hide the SCORE panel with `hidden`/CSS and pause playback through the controller/port.

- [ ] **Step 4: Verify GREEN and legacy notation regression**

Run focused files plus the existing notation/Practice UI tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/mountStudentApp.js src/ui/studentAppController.js test/studentPieceWorkspaceMount.test.js test/student08Focus.test.js test/studentPlaybackLifecycle.test.js
git commit -m "fix: preserve notation across Piece view switches"
```

### Task 11: Render all authorized Piece chords in the Akorlar view

**Files:**
- Modify: `src/ui/renderPieceWorkspace.js`
- Reuse: `src/ui/renderChordBoardWorkspace.js`
- Reuse: `src/ui/chordBoardViewModel.js`
- Test: `test/studentPieceChordView.test.js`
- Keep green: `test/student08ChordBoardUi.test.js`

**Interfaces:**
- The Piece view receives `chords.items[]` already projected through existing CHORD_BOARD view models.
- `selectedChordId` chooses one authorized item.

- [ ] **Step 1: Write failing chord collection tests**

```js
assert.match(html, /data-action="select-piece-chord"[^>]*data-assignment-id="chord-am"/)
assert.match(html, /data-action="select-piece-chord"[^>]*data-assignment-id="chord-f"/)
assert.match(html, /<svg class="chord-diagram"/)
assert.doesNotMatch(html, />Teller<\/h2>/)
assert.doesNotMatch(html, />Bareler<\/h2>/)
```

Also assert an invalid/missing selected chord falls back only to the first authorized Piece chord, never a catalog lookup.

- [ ] **Step 2: Verify RED**

```bash
node --test test/studentPieceChordView.test.js test/student08ChordBoardUi.test.js
```

- [ ] **Step 3: Implement chord selector + reused exact renderer**

Do not clone/rewrite chord geometry. Call the existing exact CHORD_BOARD renderer for the selected authorized view model.

- [ ] **Step 4: Verify GREEN**

Run focused tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/renderPieceWorkspace.js test/studentPieceChordView.test.js
git commit -m "feat: show Piece chord collection"
```

### Task 12: Piece revocation/status sync and partial offline behavior

**Files:**
- Modify: `src/offline/secureDeliveryStatusService.js`
- Modify: `src/offline/syncCoordinator.js` only if Piece manifest sync cannot be composed externally; prefer adding a focused Piece sync collaborator rather than mixing package and manifest logic.
- Modify: `src/offline/secureDeliveryOfflineReadService.js`
- Test: `test/studentPieceOffline.test.js`
- Modify: `test/student08OfflineOnlineRegressionMatrix.test.js`
- Modify: `test/student08ChordBoardOffline.test.js`

**Interfaces:**
- Exact Piece status check via `getStudentPiece(pieceAssignmentId)`:
  - exact 404/not-found → mark Piece manifest revoked;
  - transient/network error → do not invent revocation.
- Child package status remains existing assignment-based logic.

- [ ] **Step 1: Write failing sync/partial-availability tests**

Required matrix:
- cached Piece + SCORE only → Nota works offline;
- cached Piece + chords only → Akorlar works offline;
- cached Piece + both → both work;
- Piece cached but zero child package caches → bounded unavailable;
- Piece revoked → offline Piece no longer opens;
- one chord revoked → remaining SCORE/other chords still usable;
- transient Piece status failure keeps prior ACTIVE metadata but does not claim verified current authority.

- [ ] **Step 2: Verify RED**

```bash
node --test test/studentPieceOffline.test.js test/student08OfflineOnlineRegressionMatrix.test.js test/student08ChordBoardOffline.test.js
```

- [ ] **Step 3: Implement exact manifest status handling**

Keep Piece manifest revocation separate from child package bytes. Do not delete bytes as an authorization mechanism.

- [ ] **Step 4: Verify GREEN**

Run focused offline tests and existing Secure Delivery status/sync tests.

- [ ] **Step 5: Commit**

```bash
git add src/offline/secureDeliveryStatusService.js src/offline/secureDeliveryOfflineReadService.js test/studentPieceOffline.test.js test/student08OfflineOnlineRegressionMatrix.test.js test/student08ChordBoardOffline.test.js
git commit -m "feat: harden Piece offline and revocation flow"
```

### Task 13: Full regression, quality gates, preview, and physical acceptance

**Files:**
- Modify docs only if implementation reality changed:
  - `docs/architecture.md`
  - `README.md`
- Do not modify production configuration merely to satisfy preview.

**Interfaces:**
- No new product API; this task is verification/handoff.

- [ ] **Step 1: Run Student App focused regression**

```bash
node --test   test/pieceAssignment.test.js   test/secureDeliveryApiClient.test.js   test/secureDeliveryStudent08ReadService.test.js   test/secureDeliveryOfflineReadService.test.js   test/studentPieceWorkspaceController.test.js   test/studentPieceWorkspaceUi.test.js   test/studentPieceWorkspaceMount.test.js   test/studentPieceChordView.test.js   test/studentPieceOffline.test.js   test/student08ChordBoardController.test.js   test/student08ChordBoardReadService.test.js   test/student08ChordBoardUi.test.js   test/student08ChordBoardOffline.test.js   test/student08PracticeUi.test.js   test/studentPlaybackLifecycle.test.js   test/student08OfflineOnlineRegressionMatrix.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full deterministic verification**

```bash
npm test
git diff --check
```

Run the repository's existing deterministic piano asset verification exactly as CI does. Do not claim code coverage unless a real coverage tool is configured.

- [ ] **Step 3: Exact-head remote gates**

Push implementation branch and verify:
- exact-head CI PASS;
- Sonar Quality Gate PASS;
- zero unresolved review threads before physical acceptance;
- branch base drift reported;
- no production deploy triggered accidentally.

- [ ] **Step 4: Separate preview only after explicit preview approval**

Preview must use the exact Student implementation head and a Piece-capable test backend/fixture that returns at least:

```text
Aktif Çalışmalar
  Cambaz
    SCORE child
    Am + F CHORD_BOARD children
  Fikrimin İnce Gülü
    SCORE child
    at least one CHORD_BOARD child
```

Do not call a static chord-only harness “Piece end-to-end acceptance”. The preview must exercise real Piece manifest → child resolution if the backend Piece branch is available; otherwise label it explicitly as UI-only.

- [ ] **Step 5: Physical iPhone acceptance checklist**

Human tester confirms:
- Piece names appear in Aktif Çalışmalar;
- Cambaz opens one Piece Workspace;
- visible `← Geri` returns to Aktif Çalışmalar;
- score area uses focus-mode width;
- `Nota → Akorlar → Nota` keeps notation visible;
- playback works after returning to Nota;
- all Piece chords appear under Akorlar;
- another Piece reuses the same shell with different content;
- Completed/Repertoire do not consume workspace width;
- VoiceOver announces back, Piece title, view selector and chord semantics;
- warm offline behavior matches cached child availability.

- [ ] **Step 6: Stop at human merge gates**

Report separately:
1. producer Piece authority PR exact SHA + tests/CI/security;
2. Student Piece Workspace PR exact SHA + tests/CI/Sonar;
3. physical acceptance result;
4. remaining dependency/merge order.

Do not merge either PR or deploy production until explicitly authorized.

---

## Dependency / Merge Order

1. Producer Piece authority PR becomes technically merge-ready.
2. Student App implementation is rebased onto its approved prerequisite CHORD_BOARD baseline and verified against the producer Piece API contract.
3. Separate preview + physical iPhone acceptance passes.
4. Human explicitly approves producer merge.
5. Re-verify Student branch against merged producer contract and current Student `main`.
6. Human explicitly approves Student merge; remember Student `main` auto-deploys production.
7. Production behavior is smoke-tested without changing unrelated Firebase/Service Worker configuration.

## Plan Self-Review Checklist

Before execution begins, verify:
- every Piece join uses IDs, never title;
- no runtime TAB field/tab is introduced in V1;
- producer and Student changes remain separate PRs;
- IndexedDB migration is additive and keeps legacy package stores readable;
- `#st-score-root` identity test exists before mount implementation;
- legacy assignment tests remain in every relevant regression set;
- Piece-level state controls folder placement while child-level authorization remains independently enforced;
- preview cannot be mistaken for production or for a true backend E2E if it uses static fixtures.
