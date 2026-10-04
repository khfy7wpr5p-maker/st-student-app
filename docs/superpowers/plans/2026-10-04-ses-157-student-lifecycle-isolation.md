# SES-157 Student Lifecycle Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that one Piece remains one student-visible work across ACTIVE/COMPLETED/REPERTOIRE, never leaks SCORE/CHORD children as duplicate rows, and loses Piece plus child authorization after a successful reconnect revoke.

**Architecture:** Keep Piece as the student-visible aggregate. Reuse the existing `studentAppController.showMyWork()` child-suppression rule, `secureDeliveryOfflineReadService` cache boundary, `syncCoordinator` foreground revalidation, and existing offline repository authorization records. Start with acceptance tests; change production only if a RED test proves that reconnect revokes the Piece manifest but leaves one or more Piece-owned child authorities active.

**Tech Stack:** JavaScript ES modules, Node `node:test`, `node:assert/strict`, Playwright 1.62.1, fake-indexeddb 6.2.5, IndexedDB/in-memory offline repositories.

**Spec:** `docs/superpowers/specs/2026-10-04-ses-157-student-lifecycle-isolation-design.md`

## Global Constraints

- Acceptance-first: existing production behavior is preserved when it already satisfies the contract.
- One fixture Piece contains one SCORE child, at least two CHORD_BOARD children, one teacher note, and stable Piece identity.
- ACTIVE, legacy COMPLETED compatibility, REPERTOIRE, online revoke, warm-cache offline revoke, and transient reconnect failure are all covered.
- Student code gains no lifecycle write authority.
- Exact Secure Delivery `404 NOT_FOUND` may map to revoked; generic/transient failures must never invent revocation.
- Physical cached bytes need not be deleted; authorization must be removed after successful reconnect revoke.
- No unrelated UI redesign, lifecycle redesign, storage migration, renderer change, or hard-delete feature.
- Physical iPhone Safari + VoiceOver remains a release-level completion gate; automated browser evidence is not a substitute.

## Review Focus

- Same child assignment ID appearing twice in a Piece must not create duplicate student rows or authorize guessed content; pin in Task 1.
- A Piece state transition must preserve the same `pieceAssignmentId`/`pieceId` and move visibility between folders rather than duplicate it; pin in Task 1.
- Reconnect revoke with one missing child cache record must still revoke every cached child that exists and must not fail open; pin in Task 2.
- A transient status error after warm-cache use must preserve Piece and child authorization and return `SYNC_ERROR`; pin in Task 2.
- In-memory and IndexedDB repositories must expose the same active-vs-revoked behavior for Piece manifests and child Secure Delivery access; pin in Task 3.

---

### Task 1: Pin Piece-first folder isolation and duplicate suppression

**Files:**
- Modify: `test/studentPieceWorkspaceController.test.js`
- Modify only if RED proves a defect: `src/ui/studentAppController.js`

**Interfaces:**
- Consumes: `createStudentAppController({ sharingService, student08ReadService, initialSession, ... })`; `controller.showMyWork(state)`; Piece manifests with `contentRefs.scoreAssignmentId` and `contentRefs.chordAssignmentIds`.
- Produces: regression proof that Piece children are hidden from legacy assignment rows and one Piece identity moves cleanly between lifecycle folders.

- [ ] **Step 1: Extend the Piece fixture to support lifecycle state and two chord children**

Update the local `pieceManifest()` test helper so callers can set `state`, and use child IDs `assignment-score-a`, `assignment-chord-a`, and `assignment-chord-b`.

- [ ] **Step 2: Write the failing ACTIVE duplicate-suppression test**

Add `test("ACTIVE Piece suppresses SCORE and chord children from legacy work rows", async () => { ... })`.

The fake `student08ReadService` must return:
- one ACTIVE Piece named `Cambaz`;
- legacy assignments containing exactly the same SCORE child and both CHORD_BOARD child IDs plus one unrelated legacy assignment.

After `await controller.showMyWork("ACTIVE")`, assert:
- `state.assignmentState === "ACTIVE"`;
- exactly one item has `itemKind === "PIECE"` and `pieceAssignmentId === "piece-a"`;
- none of `assignment-score-a`, `assignment-chord-a`, `assignment-chord-b` appear as standalone rows;
- the unrelated legacy assignment remains visible.

- [ ] **Step 3: Run the focused ACTIVE test**

Run: `node --test --test-name-pattern="ACTIVE Piece suppresses" test/studentPieceWorkspaceController.test.js`

Expected: PASS if current suppression is complete; otherwise FAIL on the exact leaked child row.

- [ ] **Step 4: Write lifecycle-folder tests for COMPLETED and REPERTOIRE**

Add table-driven coverage for `COMPLETED` and `REPERTOIRE` where `listPieces({ state })` returns the Piece only for the requested matching state.

Assert for each state:
- one Piece row only;
- no child standalone rows;
- `pieceAssignmentId === "piece-a"` and `pieceId === "work-a"` remain unchanged;
- teacher note remains `Parçayı yavaş çalış.`.

Also exercise ACTIVE → REPERTOIRE sequentially on the same controller/service fixture and assert the Piece does not remain in ACTIVE after the authoritative service state switches to REPERTOIRE.

- [ ] **Step 5: Add duplicate-authority review-focus coverage**

Construct a Piece whose `chordAssignmentIds` repeats the same child ID twice. Assert that the existing contract/read layer rejects duplicate authority or, if the duplicate is normalized earlier, that it cannot produce two student-visible child rows. Do not silently invent a second child identity.

- [ ] **Step 6: If and only if a Task 1 test is RED, make the smallest controller/read-boundary fix**

Modify only the exact duplicate/folder isolation seam proven RED. Do not change lifecycle authority or offline behavior in this task.

- [ ] **Step 7: Re-run Task 1 tests and the existing controller suite**

Run: `node --test test/studentPieceWorkspaceController.test.js`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add test/studentPieceWorkspaceController.test.js src/ui/studentAppController.js
git commit -m "test: pin SES-157 Piece lifecycle isolation"
```

Stage `src/ui/studentAppController.js` only if it actually changed.

---

### Task 2: Prove warm-cache reconnect revoke closes the full Piece authority graph

**Files:**
- Modify: `test/studentPieceOffline.test.js`
- Modify only if RED proves the expected gap: `src/offline/syncCoordinator.js`

**Interfaces:**
- Consumes: `createForegroundSyncCoordinator({ offlineRepository, publicationStatusService, secureDeliveryStatusService, clock })`; repository `markPieceManifestRevoked(...)`, `markRevoked(...)`, `getActivePieceManifest(...)`, `getActiveByAccessRef(...)`.
- Produces: after successful Piece revoke sync, no active Piece manifest and no active SCORE/CHORD child access owned by that Piece.

- [ ] **Step 1: Add a warm-cache graph fixture**

Create a helper that seeds for `student-a`:
- Piece `piece-a` with SCORE `assignment-score-a` and chords `assignment-chord-a`, `assignment-chord-b`;
- authorized offline records for all three child assignments.

Use `accessRef: { kind: "SECURE_DELIVERY", deliveryId: <assignmentId> }` for child lookups.

- [ ] **Step 2: Write the reconnect revoke acceptance test**

Add `test("successful reconnect revoke disables Piece and every cached child authority", async () => { ... })`.

Configure the status service so:
- `getAccessStatus()` returns `{ state: "ACTIVE", packageId: <matching cached packageId> }` for all three cached child records;
- `getPieceStatus()` returns `{ state: "REVOKED" }` for `piece-a`.

This isolates the behavior under test: child records remain valid on their own status checks and can only become inactive because the Piece revoke closes its authority graph.

After `await coordinator.sync({ session })`, assert exactly:
- result is `{ state: SYNC_STATES.SYNCED, checked: 4, revoked: 1, failed: 0 }`;
- `getActivePieceManifest(...) === null`;
- `getActiveByAccessRef(...) === null` for SCORE and both chords.

The public sync counter remains Piece-event based here: three child groups are checked as ACTIVE and one Piece revoke increments `revoked` once. Child authorization state is verified directly rather than redefining the counter contract.

- [ ] **Step 3: Run the reconnect revoke test and record RED evidence**

Run: `node --test --test-name-pattern="successful reconnect revoke" test/studentPieceOffline.test.js`

Expected before any production fix: FAIL only if one or more child accesses remain active after Piece revoke.

- [ ] **Step 4: If RED, implement the minimal Piece-owned child revoke cascade**

In `src/offline/syncCoordinator.js`, when an authoritative Piece status is exactly REVOKED:
1. read child IDs from the cached `record.piece.contentRefs` already associated with that Piece;
2. for each non-null SCORE ID and each chord ID, call `offlineRepository.markRevoked({ studentId, accessRef: { kind: "SECURE_DELIVERY", deliveryId }, lastVerifiedAt: verifiedAt })`;
3. call `markPieceManifestRevoked(...)` for the Piece;
4. increment the existing Piece-level `revoked` counter once, preserving current public sync semantics;
5. never scan unrelated student assignments and never guess IDs.

The implementation must tolerate a referenced child that has no cached record without authorizing anything new.

- [ ] **Step 5: Add direct-open fail-closed assertions after revoke**

Using `createSecureDeliveryOfflineReadService` in offline mode after successful revoke, assert:
- `getPiece({ pieceAssignmentId: "piece-a" })` rejects with offline Piece unavailable;
- `getScorePracticeItem({ assignmentId: "assignment-score-a" })` rejects with offline practice unavailable;
- each chord child direct cache path likewise rejects.

- [ ] **Step 6: Pin transient reconnect failure**

Add/extend a test where all child `getAccessStatus()` calls return ACTIVE but `getPieceStatus()` throws `temporary network failure` after the graph is warm-cached.

Assert:
- result is `{ state: SYNC_STATES.SYNC_ERROR, checked: 4, revoked: 0, failed: 1 }`;
- Piece manifest remains active;
- all three child `getActiveByAccessRef(...)` lookups remain active;
- no error text is serialized into the public result.

Then run a second sync where child status remains ACTIVE and Piece status becomes REVOKED; assert the graph is fully disabled with `{ state: SYNC_STATES.SYNCED, checked: 4, revoked: 1, failed: 0 }`, proving retry safety.

- [ ] **Step 7: Re-run the full offline Piece suite**

Run: `node --test test/studentPieceOffline.test.js`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add test/studentPieceOffline.test.js src/offline/syncCoordinator.js
git commit -m "fix: revoke cached Piece child authority on reconnect"
```

If production already passes the acceptance tests, commit only the tests with message `test: prove SES-157 offline recall contract`.

---

### Task 3: Pin in-memory and IndexedDB revoke parity

**Files:**
- Modify: `test/inMemoryOfflineRepository.test.js`
- Modify: `test/indexedDbOfflineRepository.test.js`
- Modify only if a parity test proves a defect: `src/offline/inMemoryOfflineRepository.js`
- Modify only if a parity test proves a defect: `src/offline/indexedDbOfflineRepository.js`

**Interfaces:**
- Consumes: repository `putPieceManifest`, `getActivePieceManifest`, `markPieceManifestRevoked`, `putAuthorized`, `getActiveByAccessRef`, `markRevoked`.
- Produces: identical active/revoked semantics across both repository implementations.

- [ ] **Step 1: Add the same Piece+children revoke scenario to the in-memory repository tests**

Seed one Piece plus SCORE/two chord Secure Delivery records. Revoke all child access refs and the Piece manifest. Assert all four active lookups return `null` while the repository does not need to delete underlying bytes/records.

- [ ] **Step 2: Add the equivalent scenario to IndexedDB tests**

Use a unique test DB name. Apply the same IDs and assertions as Step 1.

- [ ] **Step 3: Add partial-cache coverage**

Seed a Piece whose content refs name three children but cache only SCORE and one chord. Revoke the known graph and assert:
- cached children become inactive;
- the absent chord remains absent;
- no new record is created for the missing child;
- Piece manifest becomes inactive.

- [ ] **Step 4: Run both repository suites**

Run: `node --test test/inMemoryOfflineRepository.test.js test/indexedDbOfflineRepository.test.js`

Expected: PASS.

- [ ] **Step 5: If a parity test is RED, make only the failing repository implementation match the existing authorization semantics**

Do not introduce a new storage schema or migration. Keep `markRevoked`/`markPieceManifestRevoked` as authorization-state changes.

- [ ] **Step 6: Commit Task 3**

```bash
git add test/inMemoryOfflineRepository.test.js test/indexedDbOfflineRepository.test.js src/offline/inMemoryOfflineRepository.js src/offline/indexedDbOfflineRepository.js
git commit -m "test: align SES-157 offline repository revoke semantics"
```

Stage production repository files only if they changed.

---

### Task 4: Add browser acceptance for Repertuarım isolation and no child leakage

**Files:**
- Create: `browser-tests/ses157-lifecycle-isolation.spec.mjs`
- Reuse helpers from: `browser-tests/support/`
- Modify production UI only if browser RED proves a real presentation/accessibility defect.

**Interfaces:**
- Consumes: current mounted Student App, `Aktif Çalışmalar` / `Bitmiş Çalışmalar` / `Repertuarım` controls, Piece row rendering, Piece workspace navigation.
- Produces: Chromium and WebKit proof for one-row visibility, Repertuarım navigation, and accessible work controls.

- [ ] **Step 1: Create a browser fixture with one Piece and three referenced children**

Use one SCORE and two chord children plus one unrelated legacy assignment. Ensure the browser-visible backend/read fixture can switch the Piece state from ACTIVE to REPERTOIRE without changing Piece identity.

- [ ] **Step 2: Write the ACTIVE browser case**

Test name: `SES-157 ACTIVE shows one Piece row and hides child duplicates`.

Assert:
- `Cambaz` appears exactly once as a work row;
- child assignment titles/IDs are not rendered as separate work rows;
- opening the Piece exposes its available SCORE/Akor content;
- the work control has an accessible name usable by role/name selection.

- [ ] **Step 3: Write the REPERTOIRE browser case**

Switch authoritative fixture state to REPERTOIRE, navigate to `Repertuarım`, and assert:
- `Cambaz` appears exactly once;
- same Piece identity is used by the row/workspace;
- `Aktif Çalışmalar` no longer renders the Piece;
- child rows remain absent.

- [ ] **Step 4: Add the post-reconciliation revoke browser case only if the existing harness can control genuine offline/reconnect authority**

After warm-caching and authoritative revoke, trigger the existing foreground reconciliation path. Assert the Piece is no longer visible/openable. If the harness cannot faithfully control offline/reconnect authority, keep this proof in Task 2; do not add a fake browser-only simulation.

- [ ] **Step 5: Run the SES-157 browser test**

Run: `node --test browser-tests/ses157-lifecycle-isolation.spec.mjs`

Expected: PASS for every browser project instantiated by this spec.

- [ ] **Step 6: Run all browser tests**

Run: `npm run test:browser`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add browser-tests/ses157-lifecycle-isolation.spec.mjs
git commit -m "test: add SES-157 browser lifecycle acceptance"
```

---

### Task 5: Whole-branch verification and physical acceptance handoff

**Files:**
- Create: `docs/acceptance/2026-10-04-ses-157-physical-acceptance.md`
- Do not modify production code in this task.

**Interfaces:**
- Consumes: Tasks 1–4 completed branch.
- Produces: merge-ready automated evidence plus a physical iPhone Safari/VoiceOver checklist; SES-157 remains not release-Done until physical evidence is recorded.

- [ ] **Step 1: Run the complete Node suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run the complete browser suite**

Run: `npm run test:browser`

Expected: PASS.

- [ ] **Step 3: Review the diff against the branch base**

Confirm:
- no lifecycle write authority was added to Student code;
- no renderer, service-worker, OMR, auth, Secure Delivery API shape, or unrelated UI changes occurred;
- any production diff is limited to the exact RED seam proved by tests.

- [ ] **Step 4: Create the physical acceptance checklist**

The checklist records exact branch/head SHA and requires on physical iPhone Safari:
- ACTIVE Piece appears once;
- Repertuarım Piece appears once after authoritative move;
- VoiceOver can identify and open the Piece and navigate the critical folder/work controls;
- warm-cached Piece is usable while genuinely offline;
- after reconnect and successful revoke reconciliation, Piece/SCORE/chords cannot be reopened;
- a transient connection failure does not falsely revoke cached authorized work.

Do not mark these PASS without physical-device evidence.

- [ ] **Step 5: Push final branch evidence through configured GitHub workflows**

Require every configured CI/security/quality/browser check for the exact final head SHA to be green before calling the branch merge-ready.

- [ ] **Step 6: Update Linear/Notion with automated evidence and physical-device status**

SES-157 may be marked engineering-complete/merge-ready after automated gates, but release-level Done requires the physical iPhone Safari + VoiceOver evidence from Step 4.

- [ ] **Step 7: Commit the acceptance handoff**

```bash
git add docs/acceptance/2026-10-04-ses-157-physical-acceptance.md
git commit -m "docs: add SES-157 physical acceptance checklist"
```
