# STUDENT-08 S08-3 — Secure Delivery Integration Design

**Date:** 2026-09-23  
**Student repository:** `khfy7wpr5p-maker/st-student-app`  
**Student base:** PR #10, `feat/student-08-simple-pool-private-assignment`, head `f115e418cace2f89e4cf7bdb11115adf38aebaf0`  
**Teacher repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`  
**Teacher Secure Delivery baseline:** main `1632977f850517462231eeb5b0f7463085a791cd` after merged PR #248  
**Stage:** design only; implementation requires a separately approved implementation plan.

## 1. Purpose

S08-3 connects the STUDENT-08 signed-in Student App shell to the merged Teacher Secure Delivery HTTP boundary without inventing Firestore layout, recipient data, publication IDs, assignment state, or production deployment details.

The integration must make two STUDENT-08 read paths real:

1. **Havuz** reads authenticated, sanitized Pool items.
2. **Benim Çalışmalarım / SCORE** reads authenticated private SCORE assignments and opens the exact approved PracticePackage returned by Secure Delivery.

The integration remains read-only from the Student App. Teacher lifecycle writes, direct browser Firestore authority, TD-07 Chord Board delivery, production Firebase activation, credentials, billing, rules/index deployment, and STUDENT-09 remain out of scope.

## 2. Design constraints

The design preserves these existing truths:

- Firebase Authentication establishes the browser identity.
- The Student App session continues to use the Firebase UID as its stable local `studentId`.
- The Student App never sends a caller-selected student or teacher ID to Secure Delivery.
- Secure Delivery derives server authority only from the bearer token.
- Direct browser Firestore access remains separate legacy behavior and is not extended to TD-06 collections.
- Pool recipient lists are server-private and must never be reconstructed in Student App.
- Revoked Pool publications and revoked private deliveries are absent from fresh authenticated reads.
- PracticePackage v1 stays the canonical SCORE payload.
- Existing publication-based Student App flows remain backward-compatible until deliberately retired.
- No fake `publicationId`, fake `ACTIVE` state, or guessed assignment metadata may be created to make existing interfaces fit.

## 3. Why a direct Firestore mapping is rejected

TD-06 intentionally places private delivery authority behind `/api/secure-delivery/v1` and denies direct client authority over its Firestore data.

Therefore S08-3 must not:

- read `poolPublications`, `deliveries`, `preparedAssignments`, `assignmentLifecycle`, or `practicePackages` directly from the browser;
- recreate TD-06 recipient subcollection logic in Student App;
- expose Firestore document paths or internal IDs;
- use Admin credentials in Student App.

The browser consumes only the bounded HTTP read model.

## 4. Cross-repository sequence

Implementation is split into two independently reviewable PRs.

### PR A — Teacher Secure Delivery read-model extension

Repository: `khfy7wpr5p-maker/seslitab-guitar-reader`

Extend the existing private SCORE student read model. No new authority path is added.

Current response fields remain:

- `deliveryId`
- `packageId`
- `teacherNote`
- `deliveredAt`
- `package`

Add explicit assignment metadata required by STUDENT-08:

- `assignmentId`
- `practiceType`
- `state`
- `assignedAt`

The response remains sanitized. It must not include:

- `studentId`
- `teacherId`
- `providerSubject`
- raw Firebase UID/token
- authorization/evidence IDs
- recipient lists
- Firestore paths
- service-account/provider diagnostics

`assignmentId` is returned explicitly even though TD-06 currently defines `deliveryId === assignmentId`. Student App must not depend on that hidden storage invariant.

`practiceType` is currently `SCORE`. The server returns the exact producer value rather than requiring the client to manufacture it.

`state` comes from the current valid lifecycle record when present; otherwise the immutable initial assignment state is `ACTIVE`.

`assignedAt` comes from the immutable prepared assignment.

Revoked lifecycle/delivery records remain absent from new student reads.

### PR B — Student App Secure Delivery consumer

Repository: `khfy7wpr5p-maker/st-student-app`

Base: the latest verified PR #10 head after PR A is stable.

PR B adds the HTTP consumer, strict read-model validation, browser composition, practice-source generalization, and bounded offline support described below.

PR B must not write to the teacher repository.

## 5. Student Pool view contract

The existing producer-side `PoolItem` contract is not the correct Student App network contract for `SELECTED`, because producer records contain `recipientStudentIds` while the Secure Delivery response intentionally strips them.

Add a separate immutable Student App contract, conceptually:

```js
StudentPoolView {
  poolItemId,
  title,
  shortDescription,
  detailText,
  publishedAt,
  audienceMode // ALL | SELECTED
}
```

Rules:

- exactly the approved fields above are accepted;
- `recipientStudentIds` is rejected if present;
- unknown fields are rejected;
- malformed audience values fail closed;
- the client does not re-authorize `SELECTED` using missing recipient data;
- server filtering is the authority boundary;
- the client still validates the returned shape before displaying it.

`getPoolItem` may resolve by re-reading the authorized Pool list and selecting the exact `poolItemId`. No separate direct Firestore lookup is introduced.

## 6. Student assignment view contract

The controller-facing STUDENT-08 assignment view is distinct from the teacher producer `PrivateAssignment`.

For Secure Delivery, normalize each HTTP row to:

```js
StudentAssignmentView {
  assignmentId,
  title,
  practiceType: "SCORE",
  teacherNote,
  state,       // ACTIVE | COMPLETED | REPERTOIRE
  assignedAt,
  sourceRef: {
    sourceKind: "SECURE_DELIVERY",
    deliveryId
  }
}
```

`title` is taken from the validated PracticePackage in the same server row.

No recipient/student identity field is copied into the view.

Existing publication-backed assignments remain supported through the current path. Their existing `publicationId` behavior is not rewritten merely to fit the new Secure Delivery source.

## 7. Student08ReadPort

The UI controller already consumes a behavioral read-service surface. S08-3 formalizes that as the provider-neutral `Student08ReadPort`:

- `listPoolItems({ session })`
- `getPoolItem({ session, poolItemId })`
- `listAssignments({ session, state })`
- `getAssignment({ session, assignmentId })`
- `getScorePracticeItem({ session, assignmentId })`

Two implementations may coexist:

1. the current repository-backed STUDENT-08 read service used by existing tests/legacy composition;
2. a new Secure Delivery-backed read service used when the HTTP provider is explicitly configured.

The controller does not need to know whether data came from in-memory repositories, legacy publication storage, or Secure Delivery HTTP.

## 8. Secure Delivery HTTP client

Add a Student App-local HTTP client rather than importing teacher-repository source code.

The client receives:

- an injected validated `baseUrl`;
- an injected `getIdToken()`;
- an injected `fetch` seam for tests.

Methods required by S08-3:

- `listStudentPool()`
- `listStudentAssignments()`
- `getStudentAssignment(deliveryId)`

Every request obtains a fresh token through `getIdToken()` and sends it only in the Authorization header.

The client must not expose or persist:

- token strings;
- Firebase user objects;
- provider diagnostics;
- internal error payload fields.

Only bounded public error code/message/status data may leave the client.

## 9. Firebase Auth token seam

Extend the existing Firebase Auth adapter with a bounded token method.

Conceptually:

```js
authAdapter.getIdToken()
```

Requirements:

- requires an authenticated current Firebase user;
- delegates to the supported Firebase Auth `getIdToken` API;
- returns only the token string to the immediate HTTP caller;
- does not put the token into Student App session state, localStorage, IndexedDB, logs, UI state, or returned runtime metadata;
- missing user or malformed token fails closed.

The existing normalized Student App session remains UID-based and token-free.

## 10. Browser composition and configuration

Secure Delivery is opt-in at composition time.

Add a non-secret validated API base URL configuration, for example a build-time `VITE_SECURE_DELIVERY_API_BASE_URL`.

Rules:

- absent/blank/invalid configuration means Secure Delivery STUDENT-08 network integration is disabled;
- disabled configuration does not silently fall back to direct TD-06 Firestore reads;
- existing app behavior remains available for current legacy flows;
- configured integration creates the Secure Delivery HTTP client and Secure Delivery-backed `Student08ReadPort`;
- no production endpoint URL is invented or committed by this design;
- configuring or deploying a real endpoint remains a separate human gate.

## 11. Practice launch identity

The current Practice workspace assumes every authorized SCORE came from a publication and requires `publication.publicationId`. Secure Delivery does not provide a publication ID, and S08-3 must not manufacture one.

Generalize the authorization identity used for launching Practice:

```js
PracticeAccessRef =
  | { kind: "PUBLICATION", publicationId }
  | { kind: "SECURE_DELIVERY", deliveryId }
```

An authorized practice launch contains:

```js
AuthorizedPracticeItem {
  accessRef,
  package
}
```

Legacy `DeliveryItem` values adapt to `PUBLICATION`.

Secure Delivery assignment values use `SECURE_DELIVERY`.

The Practice workspace derives notation/playback only from the validated PracticePackage. Authorization identity is used for access/cache identity, not musical content.

The UI may expose the old `publicationId` field only for legacy publication-backed practice. New generic internal state should use `accessRef` or a derived stable access key.

## 12. Offline SCORE support

S08-8 requires a cached SCORE to remain usable offline. Therefore S08-3 must not stop at online HTTP wiring.

Generalize offline identity from publication-only keys to `PracticeAccessRef`.

Canonical access key:

```text
PUBLICATION:<publicationId>
SECURE_DELIVERY:<deliveryId>
```

Offline records keep:

- local Student App `studentId` (Firebase UID);
- `accessRef`;
- package ID;
- immutable PracticePackage;
- cached/last-verified timestamps;
- ACTIVE/REVOKED local access state.

Existing publication-based offline records remain readable.

IndexedDB migration must be additive and backward-compatible. Existing v1 publication records normalize to `PUBLICATION` access refs. New Secure Delivery records use `SECURE_DELIVERY` access refs. No destructive cache reset is part of S08-3.

When online, opening a Secure Delivery SCORE caches the exact validated package under its `deliveryId`.

When offline, the same signed-in local UID may open that cached Secure Delivery SCORE by exact access ref.

## 13. Offline revalidation

Publication-backed cached records continue using the existing publication-status service.

Secure Delivery cached records revalidate through the authenticated exact-assignment endpoint.

Behavior:

- exact assignment read succeeds with the same authorized delivery: mark verified ACTIVE;
- server reports the bounded not-found/revoked result: mark the cached Secure Delivery access REVOKED;
- network/provider/transient error: do not invent revocation; report sync error and preserve the last cached immutable package;
- package identity conflict for the same access ref fails closed;
- sign-out clears active in-memory Practice state and prevents another UID from reading a different student's cache.

No background token storage is introduced.

## 14. State and folder mapping

`Benim Çalışmalarım` uses the server-provided assignment state:

- `ACTIVE` → Aktif
- `COMPLETED` → Bitmiş
- `REPERTOIRE` → Repertuarım

The Student App filters only after strict validation of the server state.

No default `ACTIVE` value is inserted when the field is missing. Missing or unknown state fails closed.

## 15. SCORE opening flow

Online flow:

1. Firebase Auth restores/signs in the user.
2. Student App retains the normalized UID-based local session.
3. Secure Delivery client obtains a fresh ID token.
4. `GET /student/assignments` returns sanitized assignment rows.
5. Student App validates rows and displays folders.
6. User opens a SCORE assignment.
7. `GET /student/assignments/:deliveryId` returns the exact sanitized row and PracticePackage.
8. Student App validates the row and PracticePackage.
9. The package is cached under `SECURE_DELIVERY:<deliveryId>`.
10. Practice opens notation/playback from that exact package.

No publication record is synthesized.

## 16. Pool flow

1. Signed-in user opens Havuz.
2. Student App requests `GET /student/pool` with a fresh bearer token.
3. Server returns only authorized active `ALL` and exact-`SELECTED` views.
4. Student App rejects malformed/extra fields.
5. Havuz card/detail displays text only.
6. Havuz never opens notation, playback, Practice, or Chord Board.

## 17. Error handling

Fail closed for:

- missing authentication;
- missing/malformed bearer token;
- malformed Secure Delivery base URL;
- malformed JSON;
- unknown response fields;
- duplicate Pool IDs;
- duplicate assignment IDs;
- invalid assignment state;
- invalid PracticePackage;
- package ID mismatch;
- assignment/delivery ID mismatch;
- unsupported practice type;
- unauthorized/revoked exact assignment;
- stale session response after sign-out or account change;
- offline cache identity conflicts.

Network failures must not be converted into fake empty authorization results when doing so would hide a provider failure. UI may show bounded unavailable/error state while preserving already-authorized offline content.

## 18. TDD requirements

All behavior changes use RED → minimal GREEN → regression verification.

Teacher PR tests must cover:

- explicit `assignmentId`, `practiceType`, `state`, `assignedAt`;
- ACTIVE fallback only from a valid initial assignment, not client defaulting;
- COMPLETED and REPERTOIRE lifecycle states;
- revoked assignment exclusion;
- no student/teacher/provider/evidence leakage;
- existing Pool read behavior unchanged;
- HTTP/client contract preservation.

Student PR tests must cover:

- StudentPoolView strict validation and recipient-list rejection;
- Secure Delivery assignment strict validation;
- no fake publication ID;
- token freshness and non-persistence;
- malformed API/config fail-closed behavior;
- exact delivery ID routing;
- stale-session response suppression;
- ACTIVE/COMPLETED/REPERTOIRE folder routing;
- exact PracticePackage validation;
- Secure Delivery Practice opening;
- offline secure-delivery cache write/read;
- publication offline backward compatibility;
- IndexedDB migration compatibility;
- revoked Secure Delivery revalidation;
- transient sync failure preserves cache but reports error;
- sign-out/account switch cache isolation;
- existing PR #10 STUDENT-08 UI/focus tests;
- full repository regression, deterministic piano bank, build and browser checks.

## 19. Security invariants

S08-3 must preserve all of the following:

- Student App performs no teacher write.
- Student App performs no TD-06 direct Firestore read.
- Firebase ID token is ephemeral and never persisted.
- Server derives authority from verified bearer identity, never caller-supplied IDs.
- Pool recipient lists remain server-private.
- Private SCORE package remains exact-student and revoke-aware.
- No credential, provider diagnostic, Firestore path, teacher ID, evidence ID, or recipient list enters normal Student UI state.
- Cross-account stale async responses cannot replace the current session state.
- Offline records remain partitioned by local authenticated UID.
- No production Firebase rules/schema/index/credential/billing/deploy action occurs in implementation PRs.

## 20. Explicit non-goals

S08-3 does not implement:

- TD-07 Chord Board producer or consumer;
- STUDENT-09;
- teacher lifecycle mutation from Student App;
- student progress write-back;
- grading;
- messaging/chat;
- new OMR or notation behavior;
- production Firebase project provisioning;
- live endpoint activation;
- production deployment;
- destructive cache migration;
- direct client reads of TD-06 Firestore collections.

## 21. Merge and deployment gates

PR A and PR B may become code-complete and CI-green without any production activation.

Before either merge:

- exact head SHA must be fresh-read;
- base drift must be checked;
- required CI/browser/Sonar checks must be green;
- unresolved review threads must be zero;
- merge requires explicit human approval.

After both merges, production endpoint configuration/deployment remains a separate approval.

The STUDENT-08 physical iPhone/Safari/VoiceOver acceptance gate starts only when a branch-only or approved pilot environment can exercise the real Secure Delivery HTTP path. A mock-only preview does not count as physical acceptance.

TD-07/CHORD_BOARD physical acceptance remains blocked until the TD-07 immutable snapshot producer contract is stable.
