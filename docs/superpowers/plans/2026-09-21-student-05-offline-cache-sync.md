# STUDENT-05 Offline Cache and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add student-scoped offline Practice Package caching, foreground revocation synchronization, a static-shell service worker, and Firebase Auth/Firestore provider adapters without weakening the existing read-only authorization boundaries.

**Architecture:** Keep core Student App provider-neutral. Online authorized delivery items pass through an offline-aware Sharing Service wrapper that persists immutable student-scoped snapshots to IndexedDB; when connectivity is explicitly offline, the same wrapper reads only ACTIVE cache records for the authenticated `studentId`. Firebase adapters sit behind existing session/sharing contracts, while Service Worker caching is limited to first-party static shell assets.

**Tech Stack:** Vanilla ECMAScript modules, Node.js 24 test runner, browser IndexedDB, Service Worker/Cache Storage, Firebase Auth/Cloud Firestore adapter seams, `fake-indexeddb@6.2.5` as a test-only dependency.

**Spec:** `docs/superpowers/specs/2026-09-21-student-05-offline-cache-sync-design.md`

## Global Constraints

- Keep Student App read-only: no publish, revoke, edit, delete, or teacher-approval surface.
- Stable authorization identity remains `studentId`; for the initial Firebase adapter `studentId === Firebase user.uid`.
- Public Pool and `student_private` data remain separate authorization scopes.
- Practice Packages remain teacher-approved immutable snapshots; a new `packageId` never overwrites an older package.
- Cross-student offline reads fail closed.
- IndexedDB stores Practice Package snapshots; Service Worker/Cache Storage must not become the canonical store for Practice Package/private API payloads.
- Firebase Cloud Storage is not introduced.
- No background sync API dependency, push notification, social, payment, analytics, or editor feature is added.
- Raw MusicXML, Firebase tokens, IndexedDB payloads, provider exceptions, and debug internals must not enter generic Student UI state/status text.
- Cache, sync, Service Worker, notation, and playback failures remain independently degradable.
- Firestore package representation must not assume a Practice Package fits in one document; chunks are bounded to at most 256 KiB payload bytes.
- No credentials, Firebase project secrets, billing configuration, or live deployment changes are committed.
- Physical iPhone/Safari/VoiceOver acceptance remains STUDENT-06.
- PR creation is allowed only after exact-head CI is green; merge still requires explicit human approval.

## Review Focus

1. **Cross-student cache probing:** requesting another student's publication from the same browser must return no record and must never leak title, recipient, MusicXML, or package bytes. Task 1 and Task 2 pin this.
2. **Revocation versus network failure:** a provider/network exception must preserve ACTIVE cache; only an explicit `REVOKED` verification may change local access. Task 4 pins this.
3. **Oversized/malformed Firestore package transport:** missing, duplicate, misordered, over-limit, or byte-count-mismatched chunks must fail closed before Practice Package delivery. Task 7 pins this.
4. **Cache write failure during online Practice open:** online Practice must still open and the UI must report only bounded offline-save failure. Task 3 and Task 5 pin this.
5. **Session switch/sign-out:** active in-memory Practice state must clear immediately and cached records from the previous student must not appear for the next student. Task 5 pins this.

---

### Task 1: Shared Delivery Validation and In-Memory Offline Repository

**Files:**
- Create: `src/sharing/deliveryItem.js`
- Modify: `src/sharing/sharingService.js`
- Create: `src/offline/offlineRecord.js`
- Create: `src/offline/inMemoryOfflineRepository.js`
- Create: `test/offlineRecord.test.js`
- Create: `test/inMemoryOfflineRepository.test.js`
- Modify: `test/sharingService.test.js`

**Interfaces:**
- Consumes: `createPublication(publication)`, `assertPublishablePracticePackage(pkg)`, `getAuthenticatedStudentId(session)`.
- Produces:
  - `createDeliveryItem(publication, pkg) -> frozen { publication, package }`
  - `OFFLINE_ACCESS_STATES = { ACTIVE, REVOKED }`
  - `createOfflineRecord({ studentId, deliveryItem, cachedAt, lastVerifiedAt, accessState }) -> deep-frozen record`
  - `createInMemoryOfflineRepository() -> async repository`
  - Repository methods:
    - `putAuthorized({ studentId, deliveryItem, cachedAt, lastVerifiedAt })`
    - `listActiveForStudent({ studentId, scope = null })`
    - `listAllForStudent({ studentId })`
    - `getActiveByPublicationId({ studentId, publicationId })`
    - `markVerifiedActive({ studentId, publicationId, lastVerifiedAt })`
    - `markRevoked({ studentId, publicationId, lastVerifiedAt })`

- [ ] **Step 1: Extract delivery-item validation with characterization tests**

Add tests proving the existing Sharing Service still rejects publication/package scope mismatches and still returns the same frozen publication/package shape.

```js
test("shared delivery validation rejects mismatched package metadata", () => {
  assert.throws(
    () => createDeliveryItem(
      {
        publicationId: "pub-a",
        packageId: "pkg-a",
        scope: "public_pool",
        publishedAt: "2026-09-21T12:00:00Z",
        revokedAt: null,
      },
      makeApprovedPrivatePackage("student-a"),
    ),
    /publication does not match package publication metadata/,
  );
});
```

Run:

```bash
npm test -- test/sharingService.test.js
```

Expected: FAIL because `createDeliveryItem` is not exported from a shared module yet.

- [ ] **Step 2: Implement `src/sharing/deliveryItem.js` and make `sharingService.js` use it**

The shared module must normalize publications through `createPublication`, validate package publishability, check public/private recipient match, and return the same delivery item shape.

```js
export function createDeliveryItem(publication, pkg) {
  const normalizedPublication = createPublication(publication);
  assertPublishablePracticePackage(pkg);
  assertPublicationMatchesPackage(pkg, normalizedPublication);

  return Object.freeze({
    publication: normalizedPublication,
    package: pkg,
  });
}
```

Remove the private duplicate helpers from `sharingService.js`; do not change its public method names.

Run:

```bash
npm test -- test/sharingService.test.js
```

Expected: PASS.

- [ ] **Step 3: Write failing offline-record and repository tests**

Pin at least these cases:

```js
test("offline record snapshots one authorized student delivery", () => {
  const record = createOfflineRecord({
    studentId: "student-a",
    deliveryItem: makePublicDelivery(),
    cachedAt: "2026-09-21T12:00:00Z",
    lastVerifiedAt: "2026-09-21T12:00:00Z",
    accessState: OFFLINE_ACCESS_STATES.ACTIVE,
  });

  assert.equal(record.studentId, "student-a");
  assert.equal(record.publicationId, "pub-a");
  assert.equal(record.packageId, "pkg-a");
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.package), true);
});

test("repository never returns another student's cache", async () => {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized({
    studentId: "student-a",
    deliveryItem: makePrivateDelivery("student-a"),
    cachedAt: "2026-09-21T12:00:00Z",
    lastVerifiedAt: "2026-09-21T12:00:00Z",
  });

  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-b",
      publicationId: "pub-private",
    }),
    null,
  );
  assert.deepEqual(
    await repo.listActiveForStudent({ studentId: "student-b" }),
    [],
  );
});

test("new package ids remain distinct immutable cache records", async () => {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized(makePutArgs("student-a", makeDelivery("pub-1", "pkg-1")));
  await repo.putAuthorized(makePutArgs("student-a", makeDelivery("pub-2", "pkg-2")));

  const records = await repo.listAllForStudent({ studentId: "student-a" });
  assert.deepEqual(records.map((r) => r.packageId).sort(), ["pkg-1", "pkg-2"]);
});

test("revoked records disappear from active reads but remain stored", async () => {
  const repo = createInMemoryOfflineRepository();
  await repo.putAuthorized(makePutArgs("student-a", makeDelivery("pub-1", "pkg-1")));
  await repo.markRevoked({
    studentId: "student-a",
    publicationId: "pub-1",
    lastVerifiedAt: "2026-09-21T13:00:00Z",
  });

  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-1",
    }),
    null,
  );
  assert.equal(
    (await repo.listAllForStudent({ studentId: "student-a" }))[0].accessState,
    OFFLINE_ACCESS_STATES.REVOKED,
  );
});
```

Run:

```bash
npm test -- test/offlineRecord.test.js test/inMemoryOfflineRepository.test.js
```

Expected: FAIL because offline modules do not exist.

- [ ] **Step 4: Implement record normalization and the async in-memory repository**

Use a deterministic cache key:

```js
const cacheKey = ({ studentId, publicationId, packageId }) =>
  `${studentId}\u0000${publicationId}\u0000${packageId}`;
```

`putAuthorized` must:
- validate non-empty `studentId`;
- rebuild the delivery item through `createDeliveryItem`;
- require a private package recipient to equal `studentId`;
- structured-clone and deep-freeze the cached package;
- reject an existing identical cache key rather than mutate it;
- return an immutable record.

`markRevoked` and `markVerifiedActive` replace matching immutable records rather than mutating them.

Run:

```bash
npm test -- test/offlineRecord.test.js test/inMemoryOfflineRepository.test.js test/sharingService.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/sharing/deliveryItem.js src/sharing/sharingService.js src/offline/offlineRecord.js src/offline/inMemoryOfflineRepository.js test/offlineRecord.test.js test/inMemoryOfflineRepository.test.js test/sharingService.test.js
git commit -m "feat: add student-scoped offline record contract"
```

---

### Task 2: Browser IndexedDB Offline Repository

**Files:**
- Create: `src/offline/indexedDbOfflineRepository.js`
- Create: `test/indexedDbOfflineRepository.test.js`
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes the exact async repository contract from Task 1.
- Produces:
  - `createIndexedDbOfflineRepository({ indexedDB, dbName = "st-student-app", dbVersion = 1 })`
  - same six repository methods as `createInMemoryOfflineRepository`.

- [ ] **Step 1: Add IndexedDB test dependency and deterministic CI install**

Add:

```json
{
  "devDependencies": {
    "fake-indexeddb": "6.2.5"
  }
}
```

Generate `package-lock.json` with npm and add an install step before tests:

```yaml
- name: Install dependencies
  run: npm ci
```

Run:

```bash
npm ci
npm test
```

Expected: existing suite PASS before IndexedDB production code is added.

- [ ] **Step 2: Write failing real IndexedDB contract tests**

Use:

```js
import { indexedDB } from "fake-indexeddb";
```

Create a unique database name per test. Pin:

```js
test("IndexedDB persists and reopens a student-scoped package", async () => {
  const dbName = "st-student-test-reopen";
  const first = createIndexedDbOfflineRepository({ indexedDB, dbName });
  await first.putAuthorized(makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")));

  const reopened = createIndexedDbOfflineRepository({ indexedDB, dbName });
  const found = await reopened.getActiveByPublicationId({
    studentId: "student-a",
    publicationId: "pub-a",
  });

  assert.equal(found.packageId, "pkg-a");
  assert.equal(found.studentId, "student-a");
});

test("IndexedDB scope query cannot cross student boundary", async () => {
  const repo = createIndexedDbOfflineRepository({ indexedDB, dbName: "isolation" });
  await repo.putAuthorized(makePutArgs("student-a", makePrivateDelivery("student-a")));

  assert.deepEqual(
    await repo.listActiveForStudent({
      studentId: "student-b",
      scope: "student_private",
    }),
    [],
  );
});

test("IndexedDB revocation survives repository reopen", async () => {
  const dbName = "st-student-test-revoke";
  const repo = createIndexedDbOfflineRepository({ indexedDB, dbName });
  await repo.putAuthorized(makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")));
  await repo.markRevoked({
    studentId: "student-a",
    publicationId: "pub-a",
    lastVerifiedAt: "2026-09-21T14:00:00Z",
  });

  const reopened = createIndexedDbOfflineRepository({ indexedDB, dbName });
  assert.equal(
    await reopened.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
});
```

Run:

```bash
npm test -- test/indexedDbOfflineRepository.test.js
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement IndexedDB schema and transaction helpers**

Database v1:
- object store `practicePackages`
- keyPath `cacheKey`
- indexes:
  - `byStudent` -> `studentId`
  - `byStudentScope` -> `studentScopeKey`
  - `byStudentPublication` -> `studentPublicationKey`

Persist storage-only derived keys:

```js
{
  ...record,
  cacheKey: `${studentId}\u0000${publicationId}\u0000${packageId}`,
  studentScopeKey: `${studentId}\u0000${scope}`,
  studentPublicationKey: `${studentId}\u0000${publicationId}`
}
```

Strip those keys before returning core records. Every returned record must be normalized/deep-frozen through Task 1 helpers.

The adapter must throw a bounded repository error when `indexedDB` is missing; it must not fabricate an in-memory fallback.

Run:

```bash
npm test -- test/indexedDbOfflineRepository.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit Task 2**

```bash
git add package.json package-lock.json .github/workflows/ci.yml src/offline/indexedDbOfflineRepository.js test/indexedDbOfflineRepository.test.js
git commit -m "feat: persist offline practice packages in indexeddb"
```

---

### Task 3: Offline-Aware Sharing Service

**Files:**
- Create: `src/offline/connectivityPort.js`
- Create: `src/offline/offlineAwareSharingService.js`
- Create: `test/connectivityPort.test.js`
- Create: `test/offlineAwareSharingService.test.js`

**Interfaces:**
- Consumes:
  - existing online Sharing Service methods `listPublicPool`, `listMyWork`, `getPracticeItem`;
  - Task 1/2 offline repository;
  - `getAuthenticatedStudentId(session)`.
- Produces:
  - `CONNECTIVITY_STATES = { ONLINE, OFFLINE }`
  - `createBrowserConnectivityPort({ navigatorObject, windowObject })` with `getState()` and `subscribe(listener)`
  - `createOfflineAwareSharingService({ onlineSharingService, offlineRepository, connectivityPort, clock })`
  - async `listPublicPool`, `listMyWork`, `getPracticeItem`
  - returned delivery items may include frozen `offlineAvailability: { source, deviceAvailable, saveFailed }`
  - `source` is `"online"` or `"offline"`.

- [ ] **Step 1: Write connectivity-port tests**

Pin initial `navigator.onLine`, online/offline event subscription, unsubscribe, and no raw event object leakage.

Run:

```bash
npm test -- test/connectivityPort.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement the browser connectivity port**

```js
export const CONNECTIVITY_STATES = Object.freeze({
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
});
```

`getState()` uses `navigatorObject.onLine === false` as OFFLINE and otherwise ONLINE. `subscribe` listens to browser `online` and `offline` and emits only the normalized string state.

Run the focused test; expected PASS.

- [ ] **Step 3: Write failing offline-aware service tests**

Pin these behaviors:

```js
test("online Practice open caches after authorization and still returns Practice on cache-write failure", async () => {
  const offlineRepository = {
    async putAuthorized() { throw new Error("indexeddb quota internal detail"); },
    async getActiveByPublicationId() { return null; },
    async listActiveForStudent() { return []; },
  };

  const service = createOfflineAwareSharingService({
    onlineSharingService: makeOnlineSharingService(),
    offlineRepository,
    connectivityPort: fixedConnectivity("ONLINE"),
    clock: () => "2026-09-21T12:00:00Z",
  });

  const item = await service.getPracticeItem({
    session: studentA,
    publicationId: "pub-a",
  });

  assert.equal(item.package.packageId, "pkg-a");
  assert.deepEqual(item.offlineAvailability, {
    source: "online",
    deviceAvailable: false,
    saveFailed: true,
  });
  assert.equal(JSON.stringify(item).includes("quota internal detail"), false);
});

test("offline mode lists only this student's ACTIVE cached records", async () => {
  const service = createOfflineAwareSharingService({
    onlineSharingService: onlineServiceThatMustNotBeCalled(),
    offlineRepository: seededOfflineRepository(),
    connectivityPort: fixedConnectivity("OFFLINE"),
    clock: () => "2026-09-21T12:00:00Z",
  });

  const items = await service.listMyWork({ session: studentA });
  assert.deepEqual(items.map((x) => x.publication.publicationId), ["pub-private-a"]);
  assert.equal(items[0].offlineAvailability.source, "offline");
});

test("online authorization failure never falls back to stale cache", async () => {
  const service = createOfflineAwareSharingService({
    onlineSharingService: {
      async getPracticeItem() { throw new Error("forbidden"); },
    },
    offlineRepository: seededOfflineRepository(),
    connectivityPort: fixedConnectivity("ONLINE"),
    clock: () => "2026-09-21T12:00:00Z",
  });

  await assert.rejects(
    () => service.getPracticeItem({ session: studentA, publicationId: "pub-a" }),
    /forbidden/,
  );
});
```

Run:

```bash
npm test -- test/offlineAwareSharingService.test.js
```

Expected: FAIL because wrapper does not exist.

- [ ] **Step 4: Implement offline-aware reads**

Rules:
- require a valid session before any repository access;
- if connectivity is OFFLINE, never call online service;
- map ACTIVE offline records back through `createDeliveryItem`;
- if connectivity is ONLINE, online service is authoritative;
- best-effort cache only after successful online delivery;
- an online read/authorization error is propagated and never bypassed with stale cache;
- cache-write exceptions are swallowed into `saveFailed: true`, never copied into UI-facing objects;
- list calls annotate `deviceAvailable` by matching current-student cache, but do not cache every listed package automatically.

Run focused tests then `npm test`; expected PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/offline/connectivityPort.js src/offline/offlineAwareSharingService.js test/connectivityPort.test.js test/offlineAwareSharingService.test.js
git commit -m "feat: add offline-aware student sharing reads"
```

---

### Task 4: Foreground Revocation Synchronization

**Files:**
- Create: `src/offline/syncCoordinator.js`
- Create: `test/syncCoordinator.test.js`

**Interfaces:**
- Consumes offline repository plus provider-neutral `publicationStatusService.getPublicationStatus({ session, publicationId, scope })`.
- Provider status result:
  - `{ state: "ACTIVE", packageId }`
  - `{ state: "REVOKED" }`
- Produces:
  - `SYNC_STATES = { IDLE, SYNCING, SYNCED, SYNC_ERROR }`
  - `createForegroundSyncCoordinator({ offlineRepository, publicationStatusService, clock })`
  - `sync({ session }) -> frozen { state, checked, revoked, failed }`.

- [ ] **Step 1: Write failing revocation/failure-isolation tests**

```js
test("explicit REVOKED status blocks cached access", async () => {
  const repo = seededOfflineRepository();
  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() { return { state: "REVOKED" }; },
    },
    clock: () => "2026-09-21T15:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });
  assert.equal(result.state, "SYNCED");
  assert.equal(result.revoked, 1);
  assert.equal(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
});

test("verification exception never revokes valid cache", async () => {
  const repo = seededOfflineRepository();
  const coordinator = createForegroundSyncCoordinator({
    offlineRepository: repo,
    publicationStatusService: {
      async getPublicationStatus() { throw new Error("network down"); },
    },
    clock: () => "2026-09-21T15:00:00Z",
  });

  const result = await coordinator.sync({ session: studentA });
  assert.equal(result.state, "SYNC_ERROR");
  assert.equal(result.failed, 1);
  assert.notEqual(
    await repo.getActiveByPublicationId({
      studentId: "student-a",
      publicationId: "pub-a",
    }),
    null,
  );
});
```

Also test ACTIVE verification updates `lastVerifiedAt` without replacing `packageId`, and one failed record does not prevent verification of another.

Run:

```bash
npm test -- test/syncCoordinator.test.js
```

Expected: FAIL.

- [ ] **Step 2: Implement foreground sync with per-record isolation**

The coordinator:
1. gets current `studentId`;
2. lists all cache records for that student;
3. skips already local-REVOKED records;
4. verifies each publication;
5. changes local access only on explicit valid `REVOKED`;
6. updates verification time only on explicit `ACTIVE`;
7. counts provider exceptions as failures without deleting or revoking cache.

No background timer is added.

Run focused test and full suite; expected PASS.

- [ ] **Step 3: Commit Task 4**

```bash
git add src/offline/syncCoordinator.js test/syncCoordinator.test.js
git commit -m "feat: synchronize cached publication revocations"
```

---

### Task 5: Controller and Accessible Offline UI Integration

**Files:**
- Modify: `src/ui/studentAppController.js`
- Modify: `src/ui/renderStudentApp.js`
- Modify: `src/ui/mountStudentApp.js`
- Modify: `src/ui/shellActions.js`
- Modify: `test/studentAppController.test.js`
- Modify: `test/renderStudentApp.test.js`
- Modify: `test/shellActions.test.js`
- Modify: `test/practiceNotationLifecycle.test.js`

**Interfaces:**
- Existing Sharing Service method names stay the same but controller read/navigation methods become promise-returning:
  - `showPublicPool()`
  - `showMyWork()`
  - `openPractice(publicationId)`
- Controller additionally accepts `syncCoordinator = null`.
- Produces:
  - `synchronizeOffline()`
  - safe item summary field `deviceAvailable: boolean`
  - safe top-level `syncState` using Task 4 constants.
- Mount additionally accepts `connectivityPort = null`.

- [ ] **Step 1: Write failing async-controller tests**

Update existing controller tests to `await` the three async read methods and add:

```js
test("offline list exposes only bounded device availability metadata", async () => {
  const controller = createStudentAppController({
    sharingService: makeOfflineAwareService(),
    initialSession: student,
  });

  await controller.showMyWork();
  const item = controller.getState().items[0];

  assert.deepEqual(item, {
    publicationId: "pub-private",
    packageId: "pkg-private",
    title: "Özel Etüt",
    deviceAvailable: true,
  });
  assert.equal(JSON.stringify(controller.getState()).includes("recipientStudentId"), false);
  assert.equal(JSON.stringify(controller.getState()).includes("SECRET SCORE"), false);
});

test("cache-save failure does not block Practice or leak backend error", async () => {
  const controller = createStudentAppController({
    sharingService: serviceReturningOnlineItemWithSaveFailure(),
    initialSession: student,
  });

  await controller.openPractice("pub-public");

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.PRACTICE);
  assert.equal(controller.getState().practice.offlineSaveFailed, true);
  assert.equal(JSON.stringify(controller.getState()).includes("indexeddb"), false);
});

test("sign out after offline use clears active Practice and session", async () => {
  const controller = createStudentAppController({
    sharingService: makeOfflineAwareService(),
    initialSession: student,
  });
  await controller.openPractice("pub-private");
  controller.signOut();

  assert.equal(controller.getPracticeRenderSource(), null);
  assert.equal(controller.getState().session, null);
});
```

Run:

```bash
npm test -- test/studentAppController.test.js
```

Expected: FAIL until controller awaits service results and projects offline metadata.

- [ ] **Step 2: Make controller reads async without changing write authority**

Use `await Promise.resolve(sharingService.method(...))` so current synchronous test doubles remain valid.

Extend frozen state with:

```js
syncState: SYNC_STATES.IDLE
```

Project only:
- `deviceAvailable` into list summaries;
- `offlineSaveFailed` / `deviceAvailable` into safe Practice view model metadata.

Do not add package bytes, `studentId`, recipient, Firebase fields, cache timestamps, or raw errors to UI state.

`synchronizeOffline()` delegates to `syncCoordinator` only when configured; otherwise returns unchanged safe state.

Run focused test; expected PASS.

- [ ] **Step 3: Write failing renderer/mount tests for textual status**

Pin:
- `Cihazda mevcut` appears for `deviceAvailable: true`;
- `Çevrimdışı kaydedilemedi` appears for Practice save failure;
- connectivity status is text, not color-only;
- raw provider/cache exception text never appears;
- disabled/unavailable actions remain disabled or absent;
- existing notation lifecycle still disposes correctly after awaited Practice navigation.

Example:

```js
assert.match(
  renderStudentApp(state, { connectivityState: "OFFLINE" }),
  /Çevrimdışı/,
);
assert.match(html, /Cihazda mevcut/);
assert.doesNotMatch(html, /quota|indexeddb|firebase|token/i);
```

Run:

```bash
npm test -- test/renderStudentApp.test.js test/shellActions.test.js test/practiceNotationLifecycle.test.js
```

Expected: FAIL.

- [ ] **Step 4: Integrate connectivity subscription and foreground sync at mount**

`mountStudentApp`:
- reads `connectivityPort.getState()`;
- subscribes when available;
- repaints bounded status on OFFLINE/ONLINE transition;
- on transition to ONLINE, calls `controller.synchronizeOffline()` best-effort before repaint;
- unsubscribes during `destroy()`;
- never copies event/provider errors into `status`.

`dispatchStudentAppAction` already returns controller calls; retain its await-compatible behavior.

Run focused UI/lifecycle tests and full suite; expected PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/ui/studentAppController.js src/ui/renderStudentApp.js src/ui/mountStudentApp.js src/ui/shellActions.js test/studentAppController.test.js test/renderStudentApp.test.js test/shellActions.test.js test/practiceNotationLifecycle.test.js
git commit -m "feat: expose bounded offline state in student UI"
```

---

### Task 6: Static App-Shell Service Worker

**Files:**
- Create: `service-worker.js`
- Create: `src/offline/serviceWorkerRegistration.js`
- Modify: `src/ui/main.js`
- Create: `test/serviceWorkerRegistration.test.js`
- Modify: `test/staticShell.test.js`

**Interfaces:**
- Produces `registerStudentAppServiceWorker({ navigatorObject = globalThis.navigator } = {}) -> Promise<{ registered: boolean }>`.
- Service Worker cache is versioned, first-party, and contains only application shell/static source assets.

- [ ] **Step 1: Write failing static boundary tests**

Tests must read `service-worker.js` as text and assert:
- versioned cache name exists;
- `index.html` and Student App module paths are present;
- no `/api/`, `publicPublications`, `students/`, `practicePackages`, Firebase token, or Practice Package data route is cached;
- fetch handler ignores non-GET and cross-origin requests.

Registration test:

```js
test("registration degrades safely when serviceWorker is unavailable", async () => {
  assert.deepEqual(
    await registerStudentAppServiceWorker({ navigatorObject: {} }),
    { registered: false },
  );
});
```

Run:

```bash
npm test -- test/serviceWorkerRegistration.test.js test/staticShell.test.js
```

Expected: FAIL.

- [ ] **Step 2: Implement shell-only precache and registration**

Use a static allowlist rooted at the service worker scope. Include the current static app entry and all transitive first-party modules needed for Sign In/Home/List/Practice shell rendering; do not cache provider/API responses.

Fetch strategy:
- same-origin GET + allowlisted shell asset -> cache-first with network fill for that same allowlisted asset;
- all other requests -> untouched `fetch(event.request)`.

Install activates only after successful shell precache. Activate deletes only prior `st-student-shell-*` cache versions.

`main.js` calls registration best-effort and does not block app mount if registration fails.

Run focused tests then full suite; expected PASS.

- [ ] **Step 3: Commit Task 6**

```bash
git add service-worker.js src/offline/serviceWorkerRegistration.js src/ui/main.js test/serviceWorkerRegistration.test.js test/staticShell.test.js
git commit -m "feat: cache only the student app shell"
```

---

### Task 7: Firebase Auth, Firestore Transport, and Security Rules

**Files:**
- Create: `src/providers/firebase/firebaseAuthAdapter.js`
- Create: `src/providers/firebase/firestorePackageTransport.js`
- Create: `src/providers/firebase/firestoreSharingAdapter.js`
- Create: `firebase/firestore.rules`
- Create: `test/firebaseAuthAdapter.test.js`
- Create: `test/firestorePackageTransport.test.js`
- Create: `test/firestoreSharingAdapter.test.js`
- Create: `test/firestoreRules.test.js`

**Interfaces:**
- No Firebase SDK package is imported into core modules.
- Firebase adapter modules accept the SDK functions/objects they need from the host integration boundary.
- Produces:
  - `studentSessionFromFirebaseUser(user)`
  - `createFirebaseAuthAdapter({ auth, sdk })` with `restoreSession()` and `subscribe(listener)`
  - `FIRESTORE_PACKAGE_REPRESENTATION_VERSION = "1"`
  - `MAX_FIRESTORE_CHUNK_BYTES = 256 * 1024`
  - `decodeFirestorePackage({ manifest, chunks }) -> validated Practice Package`
  - `createFirestoreSharingAdapter({ db, sdk })` implementing async `listPublicPool`, `listMyWork`, `getPracticeItem`
  - same adapter also implements `getPublicationStatus({ session, publicationId, scope })`.

- [ ] **Step 1: Write Firebase Auth normalization tests**

```js
test("Firebase uid becomes the stable Student App studentId", () => {
  const session = studentSessionFromFirebaseUser({
    uid: "firebase-uid-a",
    email: "a@example.test",
    displayName: "Ali",
  });

  assert.equal(session.studentId, "firebase-uid-a");
  assert.equal(Object.isFrozen(session), true);
});

test("raw Firebase token fields are ignored", () => {
  const session = studentSessionFromFirebaseUser({
    uid: "firebase-uid-a",
    stsTokenManager: { accessToken: "SECRET" },
  });

  assert.equal(JSON.stringify(session).includes("SECRET"), false);
});
```

`restoreSession()` must configure local persistence through injected SDK functions and resolve only a normalized authenticated session or `null`.

Run:

```bash
npm test -- test/firebaseAuthAdapter.test.js
```

Expected: FAIL.

- [ ] **Step 2: Implement Firebase Auth adapter with no credential literals**

The module may only use injected `sdk.setPersistence`, `sdk.browserLocalPersistence`, and `sdk.onAuthStateChanged`. It must never serialize provider user/token objects into Student UI state.

Run focused test; expected PASS.

- [ ] **Step 3: Write failing Firestore package-transport tests**

Build serialized UTF-8 Practice Package bytes, split them in test fixtures, then pin:

```js
test("manifest chunks reconstruct exactly one validated Practice Package", () => {
  const pkg = makeApprovedPracticePackage();
  const { manifest, chunks } = encodeFixture(pkg, 64);

  assert.deepEqual(decodeFirestorePackage({ manifest, chunks }), pkg);
});

for (const caseName of [
  "missing chunk",
  "duplicate chunk index",
  "out of range chunk index",
  "chunk larger than 256 KiB",
  "declared total byte mismatch",
  "invalid json",
  "invalid Practice Package",
]) {
  test(`transport fails closed for ${caseName}`, () => {
    assert.throws(() => decodeBrokenFixture(caseName));
  });
}
```

The implementation must order chunks by explicit zero-based index and verify `chunkCount` and exact UTF-8 byte count before JSON parse.

Run:

```bash
npm test -- test/firestorePackageTransport.test.js
```

Expected: FAIL.

- [ ] **Step 4: Implement the pure Firestore transport decoder**

Accepted chunk payload forms are:
- `Uint8Array`;
- Firebase-Bytes-like object exposing `toUint8Array()`.

Reject every other shape. Never use JavaScript string length as byte length; use actual `Uint8Array.byteLength`.

After JSON parse, call existing Practice Package validation/assertion before returning the object.

Run focused test; expected PASS.

- [ ] **Step 5: Write failing Firestore Sharing Adapter tests**

Use an injected fake SDK implementing only the document/query functions the adapter calls. Pin path selection:

```js
test("private read is scoped directly under authenticated uid", async () => {
  const calls = [];
  const adapter = createFirestoreSharingAdapter({
    db: {},
    sdk: fakeFirestoreSdk(calls, privateFixture),
  });

  await adapter.getPracticeItem({
    session: createStudentSession({ studentId: "student-a" }),
    publicationId: "pub-private",
  });

  assert.ok(
    calls.some((x) =>
      x.path === "students/student-a/publications/pub-private"
    ),
  );
  assert.equal(
    calls.some((x) => x.path.includes("students/student-b")),
    false,
  );
});
```

Also pin:
- Public Pool comes only from `publicPublications`;
- My Work comes only from `students/{uid}/publications`;
- revoked manifest is never delivered as Practice item;
- private recipient must match current `studentId`;
- child chunk path stays under selected publication path;
- `getPublicationStatus` can return explicit REVOKED metadata without reading package chunks;
- malformed transport never reaches `createDeliveryItem`.

Run:

```bash
npm test -- test/firestoreSharingAdapter.test.js
```

Expected: FAIL.

- [ ] **Step 6: Implement Firestore adapter and rule-friendly status reads**

The host-injected SDK seam must be narrow. The adapter may consume functions equivalent to:
- `collection(db, ...segments)`
- `doc(db, ...segments)`
- `getDocs(ref)`
- `getDoc(ref)`.

Do not expose Firestore snapshots outside this module.

For revocation verification, read only publication status/manifest metadata. A revoked publication returns `{ state: "REVOKED" }` and package chunks are not fetched.

For active delivery:
1. normalize manifest to `createPublication`;
2. verify `canReadPublication`;
3. fetch exactly declared chunks;
4. decode through `decodeFirestorePackage`;
5. return `createDeliveryItem(publication, pkg)`.

Run focused tests; expected PASS.

- [ ] **Step 7: Add Firestore Security Rules and static safety checks**

Rules must express:

```text
publicPublications/{publicationId}
  authenticated students may read publication metadata
  package chunks readable only while parent revokedAt == null
  client writes denied

students/{studentId}/publications/{publicationId}
  metadata read only when request.auth.uid == studentId
  package chunks read only for same uid and active parent
  client writes denied
```

A revoked parent manifest may remain readable to the authorized student only as bounded status metadata so foreground sync can learn `REVOKED`; its chunks must be denied.

Static test must assert:
- `request.auth != null`;
- private rule compares `request.auth.uid == studentId`;
- `allow write: if false` is present for Student App-facing trees;
- chunk read condition checks active parent;
- no wildcard global package collection is readable.

Run:

```bash
npm test -- test/firestoreRules.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/providers/firebase/firebaseAuthAdapter.js src/providers/firebase/firestorePackageTransport.js src/providers/firebase/firestoreSharingAdapter.js firebase/firestore.rules test/firebaseAuthAdapter.test.js test/firestorePackageTransport.test.js test/firestoreSharingAdapter.test.js test/firestoreRules.test.js
git commit -m "feat: add firebase student provider adapters"
```

---

### Task 8: Default Offline Wiring, Documentation, and Final Verification

**Files:**
- Modify: `src/ui/main.js`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create: `docs/superpowers/progress/2026-09-21-student-05-offline-cache-sync.md`
- Modify tests as needed only to pin documented behavior; do not relax earlier assertions.

**Interfaces:**
- Default browser bootstrap creates:
  - `createIndexedDbOfflineRepository({ indexedDB: globalThis.indexedDB })` when IndexedDB exists;
  - `createBrowserConnectivityPort(...)`;
  - `createOfflineAwareSharingService(...)` around the currently configured online service;
  - foreground sync only when a provider status service is configured.
- Firebase project-specific initialization remains host/deployment configuration because no credentials/project configuration are committed.

- [ ] **Step 1: Add failing default-bootstrap boundary tests**

Pin:
- default bootstrap contains no Firebase API key/project ID/token literal;
- IndexedDB failure cannot prevent mount;
- Service Worker registration failure cannot prevent mount;
- no management service is injected;
- no Firebase Cloud Storage import/name;
- online service remains explicitly unconfigured unless the host supplies a provider.

Run:

```bash
npm test -- test/staticShell.test.js
```

Expected: FAIL until wiring helpers exist.

- [ ] **Step 2: Wire offline infrastructure without fake backend/auth**

Default bootstrap should:
- create notation adapter as today;
- create connectivity port;
- attempt IndexedDB repository creation;
- wrap the unconfigured online Sharing Service only when the wrapper can degrade safely;
- never fabricate a student session;
- never fabricate Firebase configuration;
- mount even when IndexedDB/Service Worker are unavailable.

Do **not** initialize a live Firebase app in `main.js` without externally supplied project configuration.

Run focused test and full suite; expected PASS.

- [ ] **Step 3: Update README and architecture truthfully**

Document:
- Firebase Auth + Firestore is the selected production provider;
- Firebase project provisioning is not committed/configured yet;
- IndexedDB owns Practice Package offline cache;
- Service Worker owns only static shell;
- online-authorized open caches best-effort;
- offline open requires restored trusted `studentId`;
- explicit REVOKED verification blocks cached access;
- network/sync failure does not revoke;
- package chunks are bounded to 256 KiB;
- Cloud Storage/background sync/push remain absent;
- STUDENT-06 still owns physical iPhone/Safari/VoiceOver acceptance.

Progress ledger records every RED/GREEN commit SHA and CI run.

- [ ] **Step 4: Run source-boundary scans**

Run repository searches that must return no unexpected production matches:

```bash
grep -RniE "firebase.*(apiKey|projectId)|accessToken|refreshToken|password" src service-worker.js firebase || true
grep -RniE "Cloud Storage|firebase/storage|getStorage|uploadBytes" src service-worker.js || true
grep -RniE "publish\(|revoke\(|createSharingManagementService" src/ui src/offline || true
grep -RniE "score-partwise|canonicalEvents|recipientStudentId" src/ui || true
```

Expected:
- no credential literals;
- no Firebase Storage use;
- no Student UI/offline management write authority;
- no raw score/canonical/recipient leakage in UI modules.

Investigate every match rather than mechanically accepting grep output.

- [ ] **Step 5: Run fresh full verification**

```bash
npm ci
npm test
```

Expected: exit 0, zero failing tests.

Then push the exact feature head and require GitHub CI success on that exact SHA before opening the PR.

- [ ] **Step 6: Whole-branch review**

Review `main...feat/student-05-offline-cache-sync` for:
- cross-student isolation;
- revoked-versus-network-failure behavior;
- immutable version handling;
- raw-data/error leakage;
- Service Worker cache scope;
- Firestore chunk bounds;
- provider-neutral core boundary;
- no accidental Firebase Storage/paid-service dependency;
- no regression to STUDENT-01 through STUDENT-04.

Fix every Critical or Important finding with a regression test and fresh full verification.

- [ ] **Step 7: Commit documentation/verification closure**

```bash
git add src/ui/main.js README.md docs/architecture.md docs/superpowers/progress/2026-09-21-student-05-offline-cache-sync.md test
git commit -m "docs: close STUDENT-05 offline cache sync"
```

- [ ] **Step 8: Open PR but do not merge**

Open:

```text
STUDENT-05: Offline Cache and Sync
```

against `main`. Confirm:
- PR head equals verified exact SHA;
- CI is SUCCESS on that SHA;
- no unresolved review threads;
- mergeability is true or explain why not.

Stop at the merge gate and wait for explicit human approval.
