# SES-190 Student Eser İste + Shared Havuz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact `Eser İste` form and read-only shared `Havuz` to Student App without disturbing existing public Pool, Piece lifecycle, offline behavior, or accessibility.

**Architecture:** Extend the existing Secure Delivery API client/read-service/controller/render/action chain rather than creating a parallel app subsystem. `Eser İste` posts only a title; shared Havuz reads presentation-only pending rows from the backend. The existing public Pool remains a separate screen and contract.

**Tech Stack:** Vanilla ES modules, Node.js test runner, Playwright 1.62.1 browser tests, existing Student 08 UI/controller architecture.

**Spec:** Cross-repo source spec: `seslitab-guitar-reader/docs/superpowers/specs/2026-10-05-ses-190-student-eser-iste-shared-havuz-design.md`

## Global Constraints

- UI remains compact and usable on iPhone Safari.
- `Eser İste` asks only for title.
- Success copy: `İsteğiniz öğretmeninize gönderildi.`
- Shared Havuz shows only `title` + `displayNameOrNickname`.
- No `Ben de istiyorum`, voting, counters, comments, duplicate merging, or student lifecycle actions.
- Existing public Pool remains separate and unchanged.
- Existing ACTIVE/COMPLETED/REPERTOIRE Piece navigation stays unchanged.
- No internal IDs, provider identity, tokens, raw diagnostics, or management action keys render in Student UI.
- Shared Havuz is informational only and does not become an offline authorization source.
- VoiceOver must receive understandable accessible names and live success/error feedback.

## Review Focus

- Empty/whitespace title -> do not send; understandable validation feedback.
- Network failure during submit -> no false success and no duplicate optimistic row.
- Shared-Havuz fetch failure -> existing My Work/Public Pool remain usable; bounded error message only.
- Session changes while async request/read is in flight -> stale response must not repaint a different student's session.
- Browser output -> title/name are escaped and no internal IDs appear in markup.

---

### Task 1: Secure Delivery API client methods

**Files:**
- Modify: `src/providers/secureDelivery/secureDeliveryApiClient.js`
- Test: `test/secureDeliveryApiClient.test.js`

**Interfaces:**
- Consumes: backend `POST /student/work-requests` and `GET /student/work-requests/pending`.
- Produces: `requestStudentWork(title)` and `listSharedStudentWorkRequests()` on the Student App API client.

- [ ] **Step 1: Write failing client tests**
  - POST sends `{ title }` to `student/work-requests` using existing bearer/auth handling.
  - GET reads `student/work-requests/pending`.
  - 401/error wrapping remains consistent with `SecureDeliveryApiError`.
  - Existing `listStudentPool()` URL remains unchanged.

- [ ] **Step 2: Run focused client tests and verify RED**

Run: `node --test test/secureDeliveryApiClient.test.js`

Expected: FAIL because one or both SES-190 client methods are absent.

- [ ] **Step 3: Implement only the two work-request client methods**

- `requestStudentWork(title)` -> POST `student/work-requests` with `{ title }`.
- `listSharedStudentWorkRequests()` -> GET `student/work-requests/pending`.

- [ ] **Step 4: Run focused client tests and verify GREEN**

Run: `node --test test/secureDeliveryApiClient.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add student work request api methods`

### Task 2: Student 08 request/read service contract

**Files:**
- Modify: `src/sharing/secureDeliveryStudent08ReadService.js`
- Test: `test/secureDeliveryStudent08ReadService.test.js`

**Interfaces:**
- Consumes: Task 1 API client methods.
- Produces:
  - `requestWork({ session, title }) -> Promise<{ title, state?, requestedAt?, updatedAt?, targetState? }>` as a submission command wrapper.
  - `listSharedWorkRequests({ session }) -> Promise<readonly { title: string, displayNameOrNickname: string }[]>`.

- [ ] **Step 1: Write failing service tests**
  - Authenticated session required for submit and read.
  - Title is required and trimmed before request.
  - Shared list must be an array.
  - Every shared row requires non-empty `title` and `displayNameOrNickname`.
  - Extra/internal fields from a malformed backend row are not propagated into returned view objects.

- [ ] **Step 2: Run focused service tests and verify RED**

Run: `node --test test/secureDeliveryStudent08ReadService.test.js`

Expected: FAIL because SES-190 service methods are absent.

- [ ] **Step 3: Implement minimal service methods**
  - Reuse existing `requireSession` / `requiredText` patterns.
  - Validate and freeze shared presentation rows.
  - Do not cache shared-Havuz rows as offline authority.

- [ ] **Step 4: Run focused service tests and verify GREEN**

Run: `node --test test/secureDeliveryStudent08ReadService.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add student request and shared havuz service`

### Task 3: Controller states for Eser İste and shared Havuz

**Files:**
- Modify: `src/ui/studentAppController.js`
- Test: `test/student08Ui.test.js` and/or the existing controller test file used by Student 08 navigation.

**Interfaces:**
- Consumes: Task 2 `requestWork` and `listSharedWorkRequests`.
- Produces new screen/state transitions without changing `PUBLIC_POOL`:
  - `STUDENT_APP_SCREENS.WORK_REQUEST`
  - `STUDENT_APP_SCREENS.SHARED_REQUEST_POOL`
  - `showWorkRequestForm()`
  - `submitWorkRequest(title)`
  - `showSharedRequestPool()`

- [ ] **Step 1: Write failing controller tests**
  - `showWorkRequestForm()` opens empty form state without touching existing work folders.
  - `submitWorkRequest('  Sor Etüdü  ')` calls service once with `Sor Etüdü`.
  - After successful submit, controller exposes success status/state and may refresh shared Havuz only through the dedicated read method.
  - `showSharedRequestPool()` displays presentation rows only.
  - Stale async results after session replacement are ignored using the existing session-generation pattern.

- [ ] **Step 2: Run focused controller tests and verify RED**

Run the exact existing Student 08 controller/UI test file(s) selected during implementation.

Expected: FAIL because screens/actions are absent.

- [ ] **Step 3: Implement minimal controller state**
  - Add only the new screens and presentation data required by the UI.
  - Preserve Piece/public Pool state paths untouched.
  - Reuse `sessionGeneration` stale-request protection.

- [ ] **Step 4: Run focused controller tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add student request controller flow`

### Task 4: Accessible compact rendering and shell actions

**Files:**
- Modify: `src/ui/renderStudentApp.js`
- Modify: `src/ui/shellActions.js`
- Modify if action payload extraction requires it: `src/ui/mountStudentApp.js`
- Test: `test/student08Ui.test.js`
- Test: existing mount/shell action tests if present.

**Interfaces:**
- Consumes: Task 3 screens/controller methods.
- Produces:
  - Compact `Eser İste` entry point.
  - Compact `Havuz` entry point for shared requests, clearly distinct in code from existing public Pool action.
  - Request form with accessible `Eser adı` input and `Gönder` button.
  - Read-only list rendering each row as title + display name.

- [ ] **Step 1: Write failing rendering/action tests**
  - `Benim Çalışmalarım` exposes `Eser İste` and the shared-request Havuz entry points without removing existing folder controls.
  - Form contains label `Eser adı`, button `Gönder`, and no extra requested fields.
  - Shared Havuz markup contains only escaped title + display name and no data attributes carrying internal IDs.
  - No student lifecycle-management buttons render.
  - Success/error text is exposed through the app's live status pattern.

- [ ] **Step 2: Run focused UI/action tests and verify RED**

Run: `node --test test/student08Ui.test.js`

Expected: FAIL because SES-190 controls are absent.

- [ ] **Step 3: Implement minimal rendering/actions**
  - Keep current Student 08 shell structure.
  - Add dedicated action names such as `show-work-request`, `show-shared-request-pool`, `submit-work-request`; do not overload `show-public-pool`.
  - Extend mount action payload extraction only for the title input needed by submit.
  - Keep success/error copy bounded and non-technical.

- [ ] **Step 4: Run focused UI/action tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add accessible eser iste and shared havuz ui`

### Task 5: Chromium/WebKit browser acceptance

**Files:**
- Create: `browser-tests/ses190-eser-iste-shared-havuz.spec.mjs`
- Create or extend a bounded fixture under: `browser-tests/support/`

**Interfaces:**
- Consumes: Tasks 1-4 public UI behavior.
- Produces browser evidence for accessible names, request submit, shared read-only list, and lifecycle disappearance simulation.

- [ ] **Step 1: Add browser fixture**
  - Student A and Student B belong to same teacher cohort in the fixture.
  - Shared pending list contains `Carcassi Op. 60 No. 3 — Ahmet` after request submission.
  - Fixture exposes a teacher-side transition hook that changes request from PENDING to converted/revoked without adding student management authority.

- [ ] **Step 2: Add Playwright assertions**
  - Use role/accessible-name locators (`getByRole`, label-based textbox lookup) for `Eser İste`, `Eser adı`, `Gönder`, `Havuz`.
  - Student A submits the title and sees success feedback.
  - Student A and Student B can read title + display name.
  - No `Aktife Al`, `Repertuara Al`, `Kaldır`, request IDs, or student IDs are visible.
  - After simulated teacher conversion/revoke and refresh, pending row disappears.
  - Existing `Aktif Çalışmalar` / `Repertuarım` controls remain reachable.

- [ ] **Step 3: Run browser suite in existing Chromium/WebKit matrix**

Run: `npm run test:browser`

Expected: PASS in both supported browser paths used by repository CI.

- [ ] **Step 4: Commit**

Commit message: `test: cover shared request havuz browser flow`

### Task 6: Full Student App regression verification

**Files:**
- No new production files beyond Tasks 1-4.

**Interfaces:**
- Produces: fresh evidence that SES-157 lifecycle/offline behavior and existing public Pool are unchanged.

- [ ] **Step 1: Run full Node suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run full browser suite**

Run: `npm run test:browser`

Expected: PASS.

- [ ] **Step 3: Inspect final diff**
  - No change to Piece authority or offline revoke semantics.
  - No student management actions.
  - No internal identifiers in shared-Havuz markup.
  - Public Pool remains distinct.
  - New controls remain compact and VoiceOver-addressable.

- [ ] **Step 4: Stop before merge/deploy**

Merge and deploy remain separate product-owner approvals.
