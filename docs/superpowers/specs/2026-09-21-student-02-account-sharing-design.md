# STUDENT-02 — Account + Sharing Layer Design

Date: 2026-09-21  
Repository: `khfy7wpr5p-maker/st-student-app`  
Starting main SHA: `5f3fcc89a83405515c6a5b133e4bb09036849755`

## 1. Purpose

Define the minimum identity, authorization, publication, assignment, revocation, and read-only query layer required for the first ST Student App pilot of approximately 40 students.

This stage does **not** provision a real cloud backend and does not build the student UI. It establishes provider-neutral contracts and deterministic in-memory adapters so authorization behavior can be tested before choosing a vendor.

## 2. Existing Contract Preserved

STUDENT-01 remains authoritative:

- Only `teacher_approved` Practice Packages may be delivered.
- `public_pool` and `student_private` remain distinct scopes.
- Public packages must not carry `recipientStudentId`.
- Student App is read-only.
- Student App cannot create teacher approval.
- OMR, Audiveris, teacher editor state, debug state, and teacher-only metadata never enter the student delivery boundary.
- A new teacher revision creates a distinct package/version; it never silently mutates an already published package.

## 3. Approaches Considered

### A. Provider-neutral domain first — selected

Create small domain contracts and services backed by deterministic in-memory repositories for CI. Vendor adapters can be added later behind the same interfaces.

Advantages:
- No credentials or billing needed.
- Security policy is testable immediately.
- Avoids Firebase/Supabase lock-in before the domain is stable.
- Keeps STUDENT-02 focused.

Cost:
- A later provider adapter still has to be implemented.

### B. Supabase immediately

Would provide auth and persistence quickly, but would force provider-specific policy and external provisioning into the core stage.

Not selected for STUDENT-02.

### C. Firebase immediately

Would also provide auth and persistence quickly, but has the same premature lock-in and credential/provisioning concerns.

Not selected for STUDENT-02.

## 4. Domain Model

### StudentIdentity

```text
studentId: stable internal ID
email: optional login identifier
displayName: optional presentation-only field
```

Authorization always uses `studentId`. Nickname/display name/email is never the authorization key.

### Publication

```text
publicationId
packageId
scope: public_pool | student_private
recipientStudentId: required only for student_private
publishedAt
revokedAt: nullable
```

Publication metadata is separate from the Practice Package payload.

### Session

A minimal authenticated session exposes the stable internal `studentId`. STUDENT-02 does not define password storage, OAuth, provider tokens, or a real login provider.

## 5. Authorization Policy

An authenticated student may:

- read a non-revoked `public_pool` publication;
- read a non-revoked `student_private` publication only when `recipientStudentId === session.studentId`;
- query Public Pool;
- query My Work for their own private assignments.

A student may never:

- publish;
- revoke;
- modify a Practice Package;
- modify teacher source;
- create or change approval state;
- read another student's private publication.

Unauthenticated callers receive no student-private content. STUDENT-02 will also require authentication for Public Pool, matching the handoff contract.

## 6. Package Eligibility

The sharing layer accepts only packages that pass the existing `validatePracticePackage` boundary and whose `approvedRevision.state` is `teacher_approved`.

The sharing layer does not repair, reinterpret, or mutate package content.

## 7. Services and Ports

The implementation should remain small and explicit.

Candidate modules:

- `src/sharing/accessPolicy.js` — pure authorization decisions.
- `src/sharing/publication.js` — Publication validation/creation rules.
- `src/sharing/sharingService.js` — publish/revoke/query orchestration.
- `src/sharing/inMemoryPublicationRepository.js` — deterministic CI adapter.
- `src/sharing/inMemoryPackageRepository.js` — immutable package lookup adapter.
- `src/auth/session.js` — minimal authenticated student session contract.

Exact filenames may be adjusted to existing repository conventions without changing the boundaries above.

Provider-neutral ports should cover only what STUDENT-02 needs:

```text
PublicationRepository
  save(publication)
  getById(publicationId)
  listActivePublic()
  listActivePrivateForStudent(studentId)
  revoke(publicationId, revokedAt)

PackageRepository
  put(package)
  getByPackageId(packageId)
```

No network API, database migration, or vendor SDK is required in this stage.

## 8. Read Models

### Public Pool

Returns only non-revoked `public_pool` publications whose referenced Practice Package is valid and teacher-approved.

### My Work

Returns only non-revoked `student_private` publications assigned to the authenticated `studentId`.

Both queries return read-only delivery records. They do not expose teacher-only state.

## 9. Revocation

Revocation sets `revokedAt` on the publication record. Revoked publications are excluded from new online reads.

STUDENT-02 does not claim that already downloaded offline content can be remotely erased. Offline revocation semantics are handled explicitly in STUDENT-05.

## 10. Version Safety

Publication points to an immutable `packageId`. A newly approved teacher revision must produce a new Practice Package/version and a separate publication decision.

No publication operation may overwrite package content in place.

## 11. Security Invariants

Required tests:

1. Unauthenticated user cannot read student-private content.
2. Student A cannot read Student B private work.
3. Authenticated student can read non-revoked Public Pool content.
4. Public Pool publication metadata contains no `recipientStudentId`.
5. Revoked publication is excluded from new online reads.
6. Non-teacher-approved or invalid package cannot be published.
7. Authorization uses stable internal IDs, not nickname/display name/email.
8. Student-facing reads do not leak OMR/debug/editor/teacher-only state.
9. Existing STUDENT-01 tests remain green.
10. No credential, token, API key, or vendor secret is introduced.

## 12. Error Semantics

Use explicit domain errors/results for:

- unauthenticated;
- forbidden;
- publication not found;
- package not found;
- invalid package;
- package not teacher-approved;
- publication already revoked;
- malformed publication scope.

Do not expose internal stack traces or storage internals through student-facing service results.

## 13. Scope Exclusions

Not part of STUDENT-02:

- real Supabase/Firebase provisioning;
- billing;
- production credentials;
- password handling;
- social profiles;
- messaging;
- groups/classes;
- gamification/ranking;
- payments;
- UI shell;
- notation rendering;
- playback;
- offline cache;
- teacher application changes;
- OMR/Audiveris changes.

## 14. Test Strategy

Use Node's existing `node:test` stack.

TDD order should be:

1. authorization policy tests;
2. publication invariant tests;
3. package eligibility tests;
4. Public Pool query tests;
5. My Work isolation tests;
6. revocation tests;
7. version-safety tests;
8. full regression.

Each production behavior is implemented only after its focused test fails for the expected reason.

## 15. Completion Boundary

STUDENT-02 is implementation-complete when:

- provider-neutral contracts exist;
- deterministic in-memory adapters exercise all required behavior;
- required security tests pass;
- the full repository test suite passes;
- exact PR-head CI passes;
- architecture documentation reflects the implemented boundary;
- no real cloud provisioning or secret is required;
- a focused PR is opened and ready for human merge approval.

Merge remains a separate explicit human approval boundary.
