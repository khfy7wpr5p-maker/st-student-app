# STUDENT-05 — Offline Cache and Sync Design

## 1. Purpose

STUDENT-05 adds offline use to ST Student App without turning the Student App into an editor, publication authority, or backend-specific client.

The intended student experience is:

1. A student signs in through a trusted account provider.
2. While online, the student opens or downloads a teacher-approved Practice Package.
3. The approved package is stored locally for that same student.
4. If the network later disappears, previously downloaded work remains available.
5. When the app returns online, it refreshes publication access, revocation state, and newer package versions without silently mutating an older immutable package.

This phase must remain simple enough for the initial approximately 40-student use case and must not add social, messaging, payment, or editing features.

## 2. Confirmed provider decision

The initial managed backend is:

- Firebase Authentication for student identity.
- Cloud Firestore for online publication/package records and student-visible sharing data.
- IndexedDB for device-local offline Practice Package storage.
- Service Worker + Cache Storage for the static application shell only.

Firebase Cloud Storage is intentionally excluded from the first release.

The Student App core must remain provider-neutral. Firebase SDK usage belongs behind adapters so a future provider migration does not require rewriting the core authorization, offline, or Practice Workspace logic.

## 3. Existing architecture that STUDENT-05 must preserve

STUDENT-05 builds on the current main branch after STUDENT-04.

Existing invariants:

- Student App consumes only teacher-approved Practice Packages.
- Publication and Practice Package are separate concerns.
- Public Pool and student-private publication scopes remain distinct.
- Authorization depends on stable internal `studentId`, not display name or email.
- Student App cannot publish, revoke, edit, delete, or create teacher approval.
- Practice Package snapshots are immutable.
- New approved revisions use a distinct `packageId`.
- MusicXML remains a private render input, not a UI/debug/status payload.
- Capability failures stay local and must not globally lock the Practice Workspace.
- Playback remains independent from notation.
- Real auth/cloud credentials and production provisioning are adapter/deployment concerns.

## 4. Offline storage model

### 4.1 IndexedDB responsibility

IndexedDB stores offline Practice Package snapshots and their local access metadata.

Each cached record is scoped to a student and a publication/package identity.

Logical cache identity:

```text
studentId + publicationId + packageId
```

A cache record contains only what is necessary to reopen authorized offline work:

- `studentId`
- `publicationId`
- `packageId`
- publication scope
- immutable teacher-approved Practice Package snapshot
- `cachedAt`
- `lastVerifiedAt`
- local access state

Initial local access states:

- `ACTIVE`
- `REVOKED`

A newer package never overwrites an older package by `packageId`.

### 4.2 Student isolation

Offline reads always require an authenticated or otherwise trusted current session with a stable `studentId`.

The offline repository must never return a private cached package owned by another student.

A session switch changes the visible offline dataset immediately. The previous student's local records may remain physically stored, but they are not visible or readable through the current student's repository view.

Public Pool cache records are still stored under the student-specific cache namespace for v1. This deliberately favors simple access isolation over storage deduplication.

### 4.3 No fake offline identity

STUDENT-05 does not invent a local account or silently authenticate a student offline.

Offline package access is available only when the host application can supply a trusted student session representing the same stable `studentId`.

How the production Firebase auth session is persisted/restored is an adapter concern. Core Student App code only consumes the normalized session contract already established by STUDENT-02/03.

## 5. Offline repository boundary

Core code must depend on an offline repository interface, not directly on browser IndexedDB APIs.

The initial interface must support the behaviors needed by the Student App, including:

- save an authorized Practice Package snapshot for a student;
- list cached works for one student;
- get one cached publication/package for one student;
- mark cached publication access as revoked;
- retain distinct package versions;
- reject cross-student reads;
- reject invalid or non-publishable Practice Packages.

Two implementations are expected:

1. deterministic in-memory repository for unit/contract tests;
2. browser IndexedDB repository for real offline persistence.

The repository returns immutable snapshots or immutable view objects so callers cannot mutate cached teacher-approved source data.

## 6. Online-to-offline data flow

When a student opens a work while online:

```text
trusted student session
  -> online Sharing Service
  -> existing authorization checks
  -> authorized delivery item
  -> validate publishable Practice Package
  -> write immutable student-scoped offline cache record
  -> open Practice Workspace
```

Offline persistence is subordinate to successful online authorization.

If the cache write fails:

- the online Practice Workspace still opens;
- the Student App reports a bounded offline-save status;
- the package is not falsely reported as available offline;
- the online sharing result remains authoritative for that request.

## 7. Offline open flow

When online retrieval is unavailable:

```text
trusted student session
  -> offline repository
  -> same studentId
  -> ACTIVE cached record
  -> validate package snapshot
  -> Practice Workspace
```

A `REVOKED` cached record must not open.

A missing, malformed, or invalid cached record must fail only that item. Other cached works remain usable.

The offline layer must not invent new publication authorization from package metadata alone.

## 8. Listing behavior

### 8.1 Online

While online:

- Public Pool and My Work continue to come from the online Sharing Service.
- Successfully opened/downloaded work may be cached locally.
- Local cache metadata may add student-facing availability information such as `Cihazda mevcut`.

### 8.2 Offline

While offline:

- only cached records belonging to the current student are listed;
- only `ACTIVE` records are openable;
- the UI must not imply that the list is a fresh server view;
- an item can be labeled `Cihazda mevcut` or equivalent bounded Turkish copy.

The v1 offline list does not attempt to reconstruct all server publications that were never downloaded.

## 9. Synchronization model

STUDENT-05 uses explicit foreground synchronization, not background conflict machinery.

A synchronization pass occurs when the app has network access and the online data source is available.

The pass may:

- refresh Public Pool and My Work;
- verify cached publication access for visible/known records;
- mark known revoked publications `REVOKED`;
- identify newer teacher-approved package versions;
- preserve older immutable package records;
- cache a newer package only when that newer package is successfully delivered and validated.

The Student App is read-only, so there is no local edit conflict to resolve.

### 9.1 New versions

A new teacher-approved revision is represented by a distinct `packageId`.

If a new version is available:

- the old package is not mutated;
- the UI may show `Yeni sürüm mevcut`;
- downloading the new version creates a new local record;
- a failed new-version download does not corrupt or delete an older valid cached package.

### 9.2 Revocation

A remote revocation cannot be known while completely offline.

Once an online synchronization pass verifies that a publication has been revoked:

- the corresponding local access state becomes `REVOKED`;
- that cached publication must no longer open through the Student App;
- physical deletion of the cached bytes is optional for v1 and must not be claimed as immediate remote deletion.

A later version may add retention/purge policy separately.

## 10. Connectivity and sync states

The Student App may expose a small bounded status model:

- `ONLINE`
- `OFFLINE`
- `SYNCING`
- `SYNC_ERROR`

These are presentation/connectivity states, not authorization states.

Recommended student-facing Turkish copy is concise:

- `Çevrimiçi`
- `Çevrimdışı`
- `Cihazda mevcut`
- `Yeni sürüm mevcut`
- `Artık erişilemiyor`
- `Çevrimdışı kaydedilemedi`

Raw Firebase, IndexedDB, network, or stack-trace errors must never be rendered.

## 11. Failure isolation

Offline support must degrade independently.

### IndexedDB unavailable

- online Public Pool / My Work / Practice continues if the online source works;
- offline-save capability becomes unavailable;
- no false offline-success state is shown.

### Cache write failure

- current online work still opens;
- only offline persistence fails;
- existing valid cache records remain untouched.

### Cache read corruption or validation failure

- that cached record is rejected;
- other cached records remain usable;
- raw stored payload/error details do not reach the UI.

### Sync failure

- previously verified local records are preserved;
- current sync status becomes bounded error state;
- no valid cached package is deleted merely because the network or backend failed.

### Service Worker failure

- package cache in IndexedDB remains independent;
- online app operation continues when the browser can load assets normally;
- Service Worker failure does not change publication authorization.

## 12. Service Worker and Cache Storage boundary

Service Worker / Cache Storage is limited to the application shell and static assets required to start the Student App.

Examples:

- `index.html`
- Student App JavaScript modules
- static CSS
- static icons or other first-party immutable assets

Practice Package payloads, student-private API responses, publication records, and auth data must not be stored in generic HTTP cache as the canonical offline package store.

Those records belong in the student-scoped IndexedDB repository.

This prevents a shared browser HTTP cache from becoming an accidental cross-student authorization surface.

## 13. Firebase adapter boundary

Firebase is the first production provider, not a core dependency.

Expected adapter responsibilities:

### Firebase Authentication adapter

- translate the authenticated Firebase user into the normalized Student App session contract;
- derive the stable internal `studentId` from the trusted provider identity;
- never use display name as authorization identity;
- never expose raw provider credential/token data to Student UI state.

### Firestore sharing adapter

- fetch student-visible Public Pool publications;
- fetch student-private publications for the authenticated student;
- fetch the Practice Package associated with an authorized publication;
- surface revocation/version information needed for foreground sync;
- preserve existing core fail-closed authorization checks.

Firestore queries or security rules do not replace core validation. Provider and core layers provide defense in depth.

## 14. Firebase security assumptions

Production Firebase Security Rules are required before real student data is deployed.

At minimum they must enforce:

- authenticated reads only where appropriate;
- `student_private` reads only for the matching authenticated student;
- no client-side Student App write authority for teacher approval, publication, or revocation;
- no direct client mutation of immutable approved Practice Packages;
- public-pool visibility only according to the intended authenticated-student policy.

The exact Firebase project configuration, credentials, domains, billing account, and deployment secrets are outside the repository design spec and must not be committed.

## 15. Cost boundary

The first deployment target is the Firebase Spark plan with no Firebase Cloud Storage usage.

The design assumes the initial approximately 40-student scale is small enough to remain within free quotas under ordinary teaching use, but quota consumption must be measured rather than guaranteed.

If future usage exceeds the free tier:

- do not silently enable paid services;
- measure actual reads/writes/storage first;
- decide separately whether to optimize, migrate provider, or move to a paid plan.

## 16. Accessibility and UI scope

STUDENT-05 adds only small status/availability information to existing semantic UI.

Requirements:

- offline/online status must not be conveyed by color alone;
- cached/unavailable/revoked state must have textual labels;
- buttons that cannot work offline must not appear enabled;
- the current Practice Workspace accessibility structure remains intact.

Full physical iPhone/Safari/VoiceOver acceptance remains STUDENT-06.

## 17. Security and privacy invariants

- Cross-student offline reads fail closed.
- Raw Firebase tokens/credentials never enter Student UI state.
- Raw IndexedDB records never become debug/status text.
- Cached teacher-approved source remains immutable through Student App surfaces.
- Student App still has no publish/revoke/edit/delete authority.
- Revocation learned online blocks subsequent Student App access to that cached publication.
- Service Worker cache never becomes the canonical store for private Practice Package data.
- Sign-out clears active in-memory Practice state even if IndexedDB records remain stored.

## 18. Non-goals

STUDENT-05 does not include:

- background sync API dependency;
- push notifications;
- collaborative editing;
- offline teacher editing;
- conflict resolution for mutable student content;
- Firebase Cloud Storage;
- billing automation;
- paid-plan activation;
- social profiles;
- chat/messaging;
- analytics;
- remote deletion guarantees for already cached bytes;
- renderer asset deployment design;
- playback engine implementation;
- physical-device accessibility acceptance.

## 19. Definition of Done

STUDENT-05 is complete when all of the following are demonstrated:

1. A provider-neutral offline repository contract exists.
2. An in-memory offline repository implements the contract for deterministic tests.
3. A browser IndexedDB adapter persists student-scoped offline Practice Packages.
4. Online-authorized work can be cached without changing the existing Sharing Service authorization contract.
5. Offline mode lists only cached work belonging to the current student.
6. An `ACTIVE` cached work can open through the existing Practice Workspace.
7. A `REVOKED` cached work cannot open.
8. A different student's private cached work cannot be listed or opened.
9. New `packageId` versions remain distinct and do not overwrite older packages.
10. Cache-write failure does not prevent online Practice use.
11. Sync/network failure does not destroy valid existing cache.
12. Online verified revocation updates local access to `REVOKED`.
13. Service Worker caches only the application shell/static assets and does not become the canonical Practice Package store.
14. Firebase Auth and Firestore are isolated behind provider adapters.
15. Firebase Cloud Storage is not introduced.
16. Existing STUDENT-01 through STUDENT-04 behavior remains green.
17. New offline/sync behavior is covered through TDD.
18. Exact-head CI passes before PR creation.
19. Whole-branch review has no unresolved Critical or Important findings.
20. PR is opened but not merged without explicit human approval.

## 20. Planned implementation boundaries

Likely new modules will be grouped around these responsibilities:

- offline record/contract validation;
- in-memory offline repository;
- IndexedDB offline repository;
- offline-aware read/orchestration service;
- foreground sync coordinator;
- connectivity/status projection;
- Service Worker shell caching;
- Firebase auth adapter;
- Firestore sharing adapter;
- UI integration for bounded offline/sync status.

The implementation plan must keep these units small and testable. No module should combine Firebase SDK access, IndexedDB persistence, authorization, and UI rendering in one file.
