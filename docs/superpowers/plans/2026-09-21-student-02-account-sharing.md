# STUDENT-02 Account + Sharing Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimum provider-neutral account/session, authorization, publication, revocation, and read-only sharing layer for the ST Student App pilot without provisioning a real cloud provider.

**Architecture:** Keep STUDENT-01 Practice Package v1 as the immutable student-delivery boundary. Add pure auth/publication policy modules, small provider-neutral repository contracts expressed through constructor dependencies, deterministic in-memory adapters for CI, and one orchestration service that exposes Public Pool and My Work reads. No vendor SDK, network API, UI, database migration, or production credential is introduced.

**Tech Stack:** Node.js 24, ECMAScript modules, built-in `node:test`, `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-09-21-student-02-account-sharing-design.md`

## Global Constraints

- Only `teacher_approved` Practice Packages may be delivered.
- `public_pool` and `student_private` remain distinct scopes.
- Public packages must not carry `recipientStudentId`.
- Student App is read-only and cannot create teacher approval.
- Authorization must use stable internal `studentId`, never nickname, display name, or email.
- Revoked publications are excluded from new online reads.
- Existing downloaded offline data is not remotely erased in STUDENT-02.
- A new teacher revision is a distinct Practice Package/version and must never silently mutate a previously published package.
- No Firebase/Supabase/vendor SDK, network API, database migration, billing, password handling, secret, API key, or production credential is introduced.
- Do not modify Teacher App, OMR/Audiveris, notation rendering, playback, offline cache, or student UI.
- Existing STUDENT-01 tests must remain green.

## Review Focus

1. **Caller supplies a session-shaped object without a valid `studentId`:** treat it as unauthenticated, never as a permissive anonymous session. Covered in Task 1.
2. **Private publication uses a display name/email that matches another student's profile:** deny access because only stable internal `studentId` is authoritative. Covered in Task 2.
3. **A stored package becomes malformed or non-approved after repository insertion through test/future adapter misuse:** read service must re-check package eligibility before returning it. Covered in Task 5.
4. **Repeated revoke of the same publication:** remain deterministic and do not resurrect or duplicate state. Covered in Task 6.
5. **Attempt to overwrite an existing `packageId` with different revision/content:** reject to preserve immutable version semantics. Covered in Task 4.

---

### Task 1: Minimal Student Session Contract

**Files:**
- Create: `src/auth/session.js`
- Create: `test/session.test.js`

**Interfaces:**
- Consumes: none.
- Produces:
  - `createStudentSession({ studentId, email?, displayName? }) -> frozen session object`
  - `getAuthenticatedStudentId(session) -> string | null`
  - `isAuthenticatedStudent(session) -> boolean`

- [ ] **Step 1: Write failing tests for valid and invalid sessions**

Create `test/session.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  createStudentSession,
  getAuthenticatedStudentId,
  isAuthenticatedStudent,
} from "../src/auth/session.js";

test("student session exposes stable internal studentId", () => {
  const session = createStudentSession({
    studentId: "student-001",
    email: "student@example.test",
    displayName: "Ali",
  });

  assert.equal(session.studentId, "student-001");
  assert.equal(getAuthenticatedStudentId(session), "student-001");
  assert.equal(isAuthenticatedStudent(session), true);
  assert.equal(Object.isFrozen(session), true);
});

test("missing or blank studentId is unauthenticated", () => {
  assert.equal(getAuthenticatedStudentId(null), null);
  assert.equal(getAuthenticatedStudentId({}), null);
  assert.equal(getAuthenticatedStudentId({ studentId: "   " }), null);
  assert.equal(isAuthenticatedStudent({ email: "same@example.test" }), false);
});

test("display fields never substitute for studentId", () => {
  assert.equal(
    getAuthenticatedStudentId({
      email: "student-001",
      displayName: "student-001",
    }),
    null,
  );
});

test("createStudentSession rejects blank studentId", () => {
  assert.throws(
    () => createStudentSession({ studentId: " " }),
    /studentId must be a non-empty string/,
  );
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node --test test/session.test.js
```

Expected: FAIL because `src/auth/session.js` does not exist.

- [ ] **Step 3: Implement minimal session contract**

Create `src/auth/session.js`:

```js
const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function createStudentSession({
  studentId,
  email = null,
  displayName = null,
}) {
  if (!hasText(studentId)) {
    throw new TypeError("studentId must be a non-empty string");
  }

  return Object.freeze({
    studentId,
    email: hasText(email) ? email : null,
    displayName: hasText(displayName) ? displayName : null,
  });
}

export function getAuthenticatedStudentId(session) {
  if (
    session === null ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    !hasText(session.studentId)
  ) {
    return null;
  }

  return session.studentId;
}

export function isAuthenticatedStudent(session) {
  return getAuthenticatedStudentId(session) !== null;
}
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```bash
node --test test/session.test.js
```

Expected: 4 tests PASS, 0 FAIL.

- [ ] **Step 5: Run existing regression**

Run:

```bash
npm test
```

Expected: existing STUDENT-01 tests plus Task 1 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/session.js test/session.test.js
git commit -m "feat: add student session contract"
```

---

### Task 2: Publication Contract and Access Policy

**Files:**
- Create: `src/sharing/publication.js`
- Create: `src/sharing/accessPolicy.js`
- Create: `test/publication.test.js`
- Create: `test/accessPolicy.test.js`

**Interfaces:**
- Consumes:
  - `getAuthenticatedStudentId(session)`
  - `PRACTICE_PACKAGE_SCOPES` from `src/contracts/practicePackage.js`
- Produces:
  - `createPublication(input) -> frozen publication`
  - `canReadPublication({ session, publication }) -> boolean`

- [ ] **Step 1: Write failing publication invariant tests**

Create `test/publication.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_PACKAGE_SCOPES } from "../src/contracts/practicePackage.js";
import { createPublication } from "../src/sharing/publication.js";

test("public publication contains no recipientStudentId", () => {
  const publication = createPublication({
    publicationId: "pub-001",
    packageId: "pkg-001",
    scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    publishedAt: "2026-09-21T16:00:00Z",
  });

  assert.equal("recipientStudentId" in publication, false);
  assert.equal(publication.revokedAt, null);
  assert.equal(Object.isFrozen(publication), true);
});

test("public publication rejects recipientStudentId", () => {
  assert.throws(
    () =>
      createPublication({
        publicationId: "pub-001",
        packageId: "pkg-001",
        scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        recipientStudentId: "student-001",
        publishedAt: "2026-09-21T16:00:00Z",
      }),
    /recipientStudentId is not allowed for public_pool/,
  );
});

test("private publication requires recipientStudentId", () => {
  assert.throws(
    () =>
      createPublication({
        publicationId: "pub-002",
        packageId: "pkg-002",
        scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
        publishedAt: "2026-09-21T16:00:00Z",
      }),
    /recipientStudentId is required for student_private/,
  );
});
```

- [ ] **Step 2: Write failing access-policy tests**

Create `test/accessPolicy.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { PRACTICE_PACKAGE_SCOPES } from "../src/contracts/practicePackage.js";
import { canReadPublication } from "../src/sharing/accessPolicy.js";

const studentA = createStudentSession({
  studentId: "student-a",
  email: "shared@example.test",
  displayName: "Same Name",
});

const studentB = createStudentSession({
  studentId: "student-b",
  email: "shared@example.test",
  displayName: "Same Name",
});

test("authenticated student may read active public publication", () => {
  assert.equal(
    canReadPublication({
      session: studentA,
      publication: {
        publicationId: "pub-public",
        packageId: "pkg-public",
        scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        publishedAt: "2026-09-21T16:00:00Z",
        revokedAt: null,
      },
    }),
    true,
  );
});

test("unauthenticated caller cannot read public publication", () => {
  assert.equal(
    canReadPublication({
      session: null,
      publication: {
        publicationId: "pub-public",
        packageId: "pkg-public",
        scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        publishedAt: "2026-09-21T16:00:00Z",
        revokedAt: null,
      },
    }),
    false,
  );
});

test("student cannot read another student's private publication", () => {
  assert.equal(
    canReadPublication({
      session: studentA,
      publication: {
        publicationId: "pub-private",
        packageId: "pkg-private",
        scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
        recipientStudentId: "student-b",
        publishedAt: "2026-09-21T16:00:00Z",
        revokedAt: null,
      },
    }),
    false,
  );
});

test("matching email and displayName never grant private access", () => {
  const publication = {
    publicationId: "pub-private",
    packageId: "pkg-private",
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: studentB.studentId,
    publishedAt: "2026-09-21T16:00:00Z",
    revokedAt: null,
  };

  assert.equal(canReadPublication({ session: studentA, publication }), false);
  assert.equal(canReadPublication({ session: studentB, publication }), true);
});

test("revoked publication is never readable", () => {
  assert.equal(
    canReadPublication({
      session: studentA,
      publication: {
        publicationId: "pub-revoked",
        packageId: "pkg-revoked",
        scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        publishedAt: "2026-09-21T16:00:00Z",
        revokedAt: "2026-09-21T17:00:00Z",
      },
    }),
    false,
  );
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
node --test test/publication.test.js test/accessPolicy.test.js
```

Expected: FAIL because publication/access policy modules do not exist.

- [ ] **Step 4: Implement publication contract**

Create `src/sharing/publication.js`:

```js
import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function createPublication({
  publicationId,
  packageId,
  scope,
  recipientStudentId,
  publishedAt,
  revokedAt = null,
}) {
  if (!hasText(publicationId)) {
    throw new TypeError("publicationId must be a non-empty string");
  }
  if (!hasText(packageId)) {
    throw new TypeError("packageId must be a non-empty string");
  }
  if (!hasText(publishedAt)) {
    throw new TypeError("publishedAt must be a non-empty string");
  }

  if (scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL) {
    if (recipientStudentId !== undefined) {
      throw new TypeError(
        "recipientStudentId is not allowed for public_pool",
      );
    }

    return Object.freeze({
      publicationId,
      packageId,
      scope,
      publishedAt,
      revokedAt,
    });
  }

  if (scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE) {
    if (!hasText(recipientStudentId)) {
      throw new TypeError(
        "recipientStudentId is required for student_private",
      );
    }

    return Object.freeze({
      publicationId,
      packageId,
      scope,
      recipientStudentId,
      publishedAt,
      revokedAt,
    });
  }

  throw new TypeError(
    "scope must be public_pool or student_private",
  );
}
```

- [ ] **Step 5: Implement access policy**

Create `src/sharing/accessPolicy.js`:

```js
import { getAuthenticatedStudentId } from "../auth/session.js";
import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";

export function canReadPublication({ session, publication }) {
  const studentId = getAuthenticatedStudentId(session);

  if (
    studentId === null ||
    publication === null ||
    typeof publication !== "object" ||
    publication.revokedAt !== null
  ) {
    return false;
  }

  if (publication.scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL) {
    return true;
  }

  return (
    publication.scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE &&
    publication.recipientStudentId === studentId
  );
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test test/publication.test.js test/accessPolicy.test.js
```

Expected: all Task 2 tests PASS.

- [ ] **Step 7: Run regression and commit**

Run:

```bash
npm test
```

Then:

```bash
git add src/sharing/publication.js src/sharing/accessPolicy.js test/publication.test.js test/accessPolicy.test.js
git commit -m "feat: add publication access policy"
```

---

### Task 3: Package Eligibility Boundary

**Files:**
- Create: `src/sharing/packageEligibility.js`
- Create: `test/packageEligibility.test.js`

**Interfaces:**
- Consumes: `validatePracticePackage(value)`.
- Produces:
  - `assertPublishablePracticePackage(pkg) -> pkg`
  - Throws `TypeError("practice package is invalid: ...")` when the existing package contract fails.

- [ ] **Step 1: Write failing eligibility tests**

Create `test/packageEligibility.test.js` with a local valid package factory derived from `test/practicePackage.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_PACKAGE_SCOPES } from "../src/contracts/practicePackage.js";
import { assertPublishablePracticePackage } from "../src/sharing/packageEligibility.js";

function makePackage() {
  return {
    schemaVersion: "1.0.0",
    packageId: "pkg-001",
    workId: "work-001",
    title: "Etüt 1",
    approvedRevision: {
      revisionId: "R1",
      state: "teacher_approved",
      approvedAt: "2026-09-21T12:00:00Z",
    },
    publication: {
      scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    },
    content: {
      score: {
        format: "musicxml",
        data: "<score-partwise version=\"4.0\"></score-partwise>",
      },
      canonicalEvents: [],
    },
  };
}

test("teacher-approved valid package is publishable", () => {
  const pkg = makePackage();
  assert.equal(assertPublishablePracticePackage(pkg), pkg);
});

test("teacher-corrected package is not publishable", () => {
  const pkg = makePackage();
  pkg.approvedRevision.state = "teacher_corrected";

  assert.throws(
    () => assertPublishablePracticePackage(pkg),
    /teacher_approved/,
  );
});

test("teacher-only or OMR metadata cannot cross sharing boundary", () => {
  const pkg = makePackage();
  pkg.omr = { provider: "audiveris" };

  assert.throws(
    () => assertPublishablePracticePackage(pkg),
    /unsupported top-level field: omr/,
  );
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
node --test test/packageEligibility.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement minimal eligibility wrapper**

Create `src/sharing/packageEligibility.js`:

```js
import { validatePracticePackage } from "../contracts/practicePackage.js";

export function assertPublishablePracticePackage(pkg) {
  const result = validatePracticePackage(pkg);

  if (!result.ok) {
    throw new TypeError(
      `practice package is invalid: ${result.errors.join("; ")}`,
    );
  }

  return pkg;
}
```

- [ ] **Step 4: Run focused test and regression**

```bash
node --test test/packageEligibility.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sharing/packageEligibility.js test/packageEligibility.test.js
git commit -m "feat: enforce publishable package boundary"
```

---

### Task 4: Deterministic In-Memory Repositories and Package Immutability

**Files:**
- Create: `src/sharing/inMemoryPackageRepository.js`
- Create: `src/sharing/inMemoryPublicationRepository.js`
- Create: `test/inMemoryRepositories.test.js`

**Interfaces:**
- Consumes:
  - `createPublication(input)`
  - `assertPublishablePracticePackage(pkg)`
- Produces:
  - `createInMemoryPackageRepository()`
    - `put(pkg)`
    - `getByPackageId(packageId)`
  - `createInMemoryPublicationRepository()`
    - `save(publication)`
    - `getById(publicationId)`
    - `listActivePublic()`
    - `listActivePrivateForStudent(studentId)`
    - `revoke(publicationId, revokedAt)`

- [ ] **Step 1: Write failing repository tests**

Create `test/inMemoryRepositories.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_PACKAGE_SCOPES } from "../src/contracts/practicePackage.js";
import { createPublication } from "../src/sharing/publication.js";
import { createInMemoryPackageRepository } from "../src/sharing/inMemoryPackageRepository.js";
import { createInMemoryPublicationRepository } from "../src/sharing/inMemoryPublicationRepository.js";

function makePackage({
  packageId = "pkg-001",
  revisionId = "R1",
  title = "Etüt 1",
} = {}) {
  return {
    schemaVersion: "1.0.0",
    packageId,
    workId: "work-001",
    title,
    approvedRevision: {
      revisionId,
      state: "teacher_approved",
      approvedAt: "2026-09-21T12:00:00Z",
    },
    publication: {
      scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    },
    content: {
      score: {
        format: "musicxml",
        data: "<score-partwise version=\"4.0\"></score-partwise>",
      },
      canonicalEvents: [],
    },
  };
}

test("package repository rejects overwrite of existing packageId", () => {
  const repo = createInMemoryPackageRepository();
  repo.put(makePackage());

  assert.throws(
    () =>
      repo.put(
        makePackage({
          revisionId: "R2",
          title: "Changed",
        }),
      ),
    /packageId already exists/,
  );
});

test("different approved revision uses different packageId", () => {
  const repo = createInMemoryPackageRepository();
  const v1 = makePackage({ packageId: "pkg-r1", revisionId: "R1" });
  const v2 = makePackage({ packageId: "pkg-r2", revisionId: "R2" });

  repo.put(v1);
  repo.put(v2);

  assert.equal(repo.getByPackageId("pkg-r1"), v1);
  assert.equal(repo.getByPackageId("pkg-r2"), v2);
});

test("publication repository lists only active public publications", () => {
  const repo = createInMemoryPublicationRepository();

  repo.save(
    createPublication({
      publicationId: "pub-public",
      packageId: "pkg-public",
      scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
      publishedAt: "2026-09-21T16:00:00Z",
    }),
  );
  repo.save(
    createPublication({
      publicationId: "pub-private",
      packageId: "pkg-private",
      scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
      recipientStudentId: "student-a",
      publishedAt: "2026-09-21T16:00:00Z",
    }),
  );

  assert.deepEqual(
    repo.listActivePublic().map((item) => item.publicationId),
    ["pub-public"],
  );
});

test("publication repository lists private work by stable studentId only", () => {
  const repo = createInMemoryPublicationRepository();

  repo.save(
    createPublication({
      publicationId: "pub-a",
      packageId: "pkg-a",
      scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
      recipientStudentId: "student-a",
      publishedAt: "2026-09-21T16:00:00Z",
    }),
  );
  repo.save(
    createPublication({
      publicationId: "pub-b",
      packageId: "pkg-b",
      scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
      recipientStudentId: "student-b",
      publishedAt: "2026-09-21T16:00:00Z",
    }),
  );

  assert.deepEqual(
    repo.listActivePrivateForStudent("student-a").map(
      (item) => item.publicationId,
    ),
    ["pub-a"],
  );
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
node --test test/inMemoryRepositories.test.js
```

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Implement package repository**

Create `src/sharing/inMemoryPackageRepository.js`:

```js
import { assertPublishablePracticePackage } from "./packageEligibility.js";

export function createInMemoryPackageRepository() {
  const packages = new Map();

  return Object.freeze({
    put(pkg) {
      assertPublishablePracticePackage(pkg);

      if (packages.has(pkg.packageId)) {
        throw new Error("packageId already exists");
      }

      packages.set(pkg.packageId, pkg);
      return pkg;
    },

    getByPackageId(packageId) {
      return packages.get(packageId) ?? null;
    },
  });
}
```

- [ ] **Step 4: Implement publication repository**

Create `src/sharing/inMemoryPublicationRepository.js`:

```js
import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";
import { createPublication } from "./publication.js";

export function createInMemoryPublicationRepository() {
  const publications = new Map();

  return Object.freeze({
    save(publication) {
      if (publications.has(publication.publicationId)) {
        throw new Error("publicationId already exists");
      }

      publications.set(publication.publicationId, publication);
      return publication;
    },

    getById(publicationId) {
      return publications.get(publicationId) ?? null;
    },

    listActivePublic() {
      return [...publications.values()].filter(
        (publication) =>
          publication.scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL &&
          publication.revokedAt === null,
      );
    },

    listActivePrivateForStudent(studentId) {
      return [...publications.values()].filter(
        (publication) =>
          publication.scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE &&
          publication.recipientStudentId === studentId &&
          publication.revokedAt === null,
      );
    },

    revoke(publicationId, revokedAt) {
      const current = publications.get(publicationId);

      if (current === undefined) {
        return null;
      }

      if (current.revokedAt !== null) {
        return current;
      }

      const replacement = createPublication({
        ...current,
        revokedAt,
      });
      publications.set(publicationId, replacement);
      return replacement;
    },
  });
}
```

- [ ] **Step 5: Run focused test and regression**

```bash
node --test test/inMemoryRepositories.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sharing/inMemoryPackageRepository.js src/sharing/inMemoryPublicationRepository.js test/inMemoryRepositories.test.js
git commit -m "feat: add in-memory sharing repositories"
```

---

### Task 5: Sharing Service — Publish, Public Pool, and My Work

**Files:**
- Create: `src/sharing/sharingService.js`
- Create: `test/sharingService.test.js`

**Interfaces:**
- Consumes:
  - package repository `put/getByPackageId`
  - publication repository `save/getById/listActivePublic/listActivePrivateForStudent/revoke`
  - `assertPublishablePracticePackage(pkg)`
  - `canReadPublication({ session, publication })`
  - `getAuthenticatedStudentId(session)`
- Produces:
  - `createSharingService({ packageRepository, publicationRepository })`
  - service methods:
    - `publish({ package: pkg, publication })`
    - `listPublicPool({ session })`
    - `listMyWork({ session })`
    - `getPracticeItem({ session, publicationId })`
    - `revoke({ publicationId, revokedAt })`

- [ ] **Step 1: Write failing service tests**

Create `test/sharingService.test.js`. Reuse local factories for packages, publications, and sessions.

Required tests:

```js
test("unauthenticated caller cannot query Public Pool", () => {
  const service = makeServiceWithPublicItem();
  assert.throws(
    () => service.listPublicPool({ session: null }),
    /unauthenticated/,
  );
});

test("authenticated student sees active Public Pool package", () => {
  const { service, studentA } = makeServiceWithPublicItem();
  const items = service.listPublicPool({ session: studentA });

  assert.equal(items.length, 1);
  assert.equal(items[0].publication.scope, "public_pool");
  assert.equal("recipientStudentId" in items[0].publication, false);
  assert.equal(items[0].package.packageId, "pkg-public");
});

test("My Work returns only the authenticated student's private items", () => {
  const { service, studentA } = makeServiceWithPrivateItems();
  const items = service.listMyWork({ session: studentA });

  assert.deepEqual(
    items.map((item) => item.publication.recipientStudentId),
    ["student-a"],
  );
});

test("Student A cannot open Student B private publication", () => {
  const { service, studentA, studentBPublicationId } =
    makeServiceWithPrivateItems();

  assert.throws(
    () =>
      service.getPracticeItem({
        session: studentA,
        publicationId: studentBPublicationId,
      }),
    /forbidden/,
  );
});

test("publish rejects invalid or non-approved package", () => {
  const { service, publication } = makeEmptyService();
  const pkg = makePackage();
  pkg.approvedRevision.state = "teacher_corrected";

  assert.throws(
    () => service.publish({ package: pkg, publication }),
    /teacher_approved/,
  );
});

test("read service re-checks stored package eligibility", () => {
  const student = createStudentSession({ studentId: "student-a" });
  const publication = createPublication({
    publicationId: "pub-public",
    packageId: "pkg-corrupt",
    scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    publishedAt: "2026-09-21T16:00:00Z",
  });

  const packageRepository = {
    put() {},
    getByPackageId() {
      const pkg = makePackage({ packageId: "pkg-corrupt" });
      pkg.approvedRevision.state = "teacher_corrected";
      return pkg;
    },
  };

  const publicationRepository = {
    save() {},
    getById() {
      return publication;
    },
    listActivePublic() {
      return [publication];
    },
    listActivePrivateForStudent() {
      return [];
    },
    revoke() {},
  };

  const service = createSharingService({
    packageRepository,
    publicationRepository,
  });

  assert.throws(
    () => service.listPublicPool({ session: student }),
    /teacher_approved/,
  );
});
```

The test file must include concrete `makePackage`, `makeEmptyService`, `makeServiceWithPublicItem`, and `makeServiceWithPrivateItems` helpers built only from production factories defined in Tasks 1–4.

- [ ] **Step 2: Run focused test and verify RED**

```bash
node --test test/sharingService.test.js
```

Expected: FAIL because `sharingService.js` does not exist.

- [ ] **Step 3: Implement service with explicit authentication guard**

Create `src/sharing/sharingService.js`:

```js
import { getAuthenticatedStudentId } from "../auth/session.js";
import { canReadPublication } from "./accessPolicy.js";
import { assertPublishablePracticePackage } from "./packageEligibility.js";

function requireStudentId(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("unauthenticated");
  }

  return studentId;
}

function makeDeliveryItem(publication, pkg) {
  assertPublishablePracticePackage(pkg);

  return Object.freeze({
    publication,
    package: pkg,
  });
}

export function createSharingService({
  packageRepository,
  publicationRepository,
}) {
  return Object.freeze({
    publish({ package: pkg, publication }) {
      assertPublishablePracticePackage(pkg);

      if (publication.packageId !== pkg.packageId) {
        throw new Error("publication packageId does not match package");
      }

      packageRepository.put(pkg);
      publicationRepository.save(publication);

      return makeDeliveryItem(publication, pkg);
    },

    listPublicPool({ session }) {
      requireStudentId(session);

      return publicationRepository.listActivePublic().map((publication) => {
        const pkg = packageRepository.getByPackageId(publication.packageId);

        if (pkg === null) {
          throw new Error("package not found");
        }

        return makeDeliveryItem(publication, pkg);
      });
    },

    listMyWork({ session }) {
      const studentId = requireStudentId(session);

      return publicationRepository
        .listActivePrivateForStudent(studentId)
        .map((publication) => {
          const pkg = packageRepository.getByPackageId(publication.packageId);

          if (pkg === null) {
            throw new Error("package not found");
          }

          return makeDeliveryItem(publication, pkg);
        });
    },

    getPracticeItem({ session, publicationId }) {
      requireStudentId(session);

      const publication = publicationRepository.getById(publicationId);

      if (publication === null) {
        throw new Error("publication not found");
      }

      if (!canReadPublication({ session, publication })) {
        throw new Error("forbidden");
      }

      const pkg = packageRepository.getByPackageId(publication.packageId);

      if (pkg === null) {
        throw new Error("package not found");
      }

      return makeDeliveryItem(publication, pkg);
    },

    revoke({ publicationId, revokedAt }) {
      const publication = publicationRepository.revoke(
        publicationId,
        revokedAt,
      );

      if (publication === null) {
        throw new Error("publication not found");
      }

      return publication;
    },
  });
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --test test/sharingService.test.js
```

Expected: all Task 5 tests PASS.

- [ ] **Step 5: Run full regression**

```bash
npm test
```

Expected: all repository tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sharing/sharingService.js test/sharingService.test.js
git commit -m "feat: add read-only sharing service"
```

---

### Task 6: Revocation Idempotency and Version-Safe Delivery

**Files:**
- Modify: `test/inMemoryRepositories.test.js`
- Modify: `test/sharingService.test.js`
- Modify only if tests expose a defect:
  - `src/sharing/inMemoryPublicationRepository.js`
  - `src/sharing/sharingService.js`

**Interfaces:**
- Consumes Task 4 and Task 5 interfaces.
- Produces stronger guarantees only; no new public API is required.

- [ ] **Step 1: Add failing repeated-revoke test**

Append to `test/inMemoryRepositories.test.js`:

```js
test("repeated revoke is idempotent and preserves original revokedAt", () => {
  const repo = createInMemoryPublicationRepository();

  repo.save(
    createPublication({
      publicationId: "pub-revoke",
      packageId: "pkg-revoke",
      scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
      publishedAt: "2026-09-21T16:00:00Z",
    }),
  );

  const first = repo.revoke(
    "pub-revoke",
    "2026-09-21T17:00:00Z",
  );
  const second = repo.revoke(
    "pub-revoke",
    "2026-09-21T18:00:00Z",
  );

  assert.equal(first.revokedAt, "2026-09-21T17:00:00Z");
  assert.equal(second.revokedAt, "2026-09-21T17:00:00Z");
});
```

- [ ] **Step 2: Add revoked-read exclusion test**

Append to `test/sharingService.test.js`:

```js
test("revoked publication disappears from new online reads", () => {
  const { service, studentA } = makeServiceWithPublicItem();

  const before = service.listPublicPool({ session: studentA });
  assert.equal(before.length, 1);

  service.revoke({
    publicationId: before[0].publication.publicationId,
    revokedAt: "2026-09-21T18:00:00Z",
  });

  assert.deepEqual(service.listPublicPool({ session: studentA }), []);
});
```

- [ ] **Step 3: Add version-separation test**

Append to `test/sharingService.test.js`:

```js
test("new approved revision is published as a distinct package version", () => {
  const { service, studentA } = makeEmptyService();

  const packageR1 = makePackage({
    packageId: "pkg-r1",
    revisionId: "R1",
  });
  const packageR2 = makePackage({
    packageId: "pkg-r2",
    revisionId: "R2",
  });

  service.publish({
    package: packageR1,
    publication: createPublication({
      publicationId: "pub-r1",
      packageId: "pkg-r1",
      scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
      publishedAt: "2026-09-21T16:00:00Z",
    }),
  });
  service.publish({
    package: packageR2,
    publication: createPublication({
      publicationId: "pub-r2",
      packageId: "pkg-r2",
      scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
      publishedAt: "2026-09-21T17:00:00Z",
    }),
  });

  const items = service.listPublicPool({ session: studentA });

  assert.deepEqual(
    items.map((item) => item.package.approvedRevision.revisionId),
    ["R1", "R2"],
  );
});
```

- [ ] **Step 4: Run focused tests**

```bash
node --test test/inMemoryRepositories.test.js test/sharingService.test.js
```

Expected: PASS if Tasks 4–5 already satisfy the guarantees. If any test fails, change only the directly responsible repository/service code and rerun until GREEN.

- [ ] **Step 5: Run full regression**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add test/inMemoryRepositories.test.js test/sharingService.test.js src/sharing/inMemoryPublicationRepository.js src/sharing/sharingService.js
git commit -m "test: lock revocation and version safety"
```

If production files did not change, omit them from `git add`.

---

### Task 7: Architecture Documentation and Stage Verification

**Files:**
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-09-21-student-02-account-sharing.md` — this plan already exists by execution time; do not rewrite history during implementation.

**Interfaces:**
- No new runtime interfaces.
- Documentation must describe exactly the implemented contracts, not future provider details.

- [ ] **Step 1: Update architecture document**

Add a STUDENT-02 section that records:

```text
Identity:
- authenticated student session exposes stable internal studentId
- displayName/email are never authorization keys

Sharing records:
- Publication is separate from Practice Package
- public_pool has no recipientStudentId
- student_private requires recipientStudentId
- revokedAt excludes new online reads

Provider boundary:
- core services depend on repository methods, not a vendor SDK
- current adapter is deterministic in-memory only
- real provider provisioning is deferred

Versioning:
- packageId is immutable in repository
- new teacher-approved revision requires a new packageId/version
- no silent replacement
```

- [ ] **Step 2: Update README current-stage summary**

Replace the statement that no auth/sharing contract exists with a precise statement that STUDENT-02 now defines provider-neutral student session and sharing-domain contracts, while a real auth/cloud provider remains intentionally unselected.

- [ ] **Step 3: Run focused security matrix**

Run:

```bash
node --test   test/session.test.js   test/publication.test.js   test/accessPolicy.test.js   test/packageEligibility.test.js   test/inMemoryRepositories.test.js   test/sharingService.test.js
```

Expected: all STUDENT-02 tests PASS.

- [ ] **Step 4: Run full repository suite**

```bash
npm test
```

Expected: all tests PASS, including all original STUDENT-01 tests.

- [ ] **Step 5: Inspect exact branch diff against main**

Run:

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git diff main...HEAD
```

Verify:
- no secret/token/API key;
- no dependency addition;
- no vendor SDK;
- no UI/OMR/Teacher App changes;
- no weakening of STUDENT-01 Practice Package validation;
- only STUDENT-02 docs, tests, auth/sharing modules changed.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/architecture.md README.md
git commit -m "docs: document STUDENT-02 sharing boundary"
```

- [ ] **Step 7: Fresh final verification**

Run again from the exact final branch head:

```bash
npm test
git diff --check main...HEAD
```

Expected: all tests PASS; `git diff --check` produces no output and exits 0.

- [ ] **Step 8: Open focused PR**

PR title:

```text
STUDENT-02: Account and Sharing Layer
```

PR body must state:
- scope and explicit non-goals;
- starting main SHA;
- exact head SHA;
- tests run and exact results;
- security/access-control cases covered;
- architecture rulings;
- no real cloud provider provisioned;
- no credentials or billing;
- remaining limitation: real provider adapter/auth UI deferred;
- request human approval before merge.

- [ ] **Step 9: Verify exact PR-head CI**

Wait only for GitHub's current run result in this session; do not claim success from an earlier SHA. Record:
- PR number;
- head SHA;
- CI run ID;
- status/conclusion;
- unresolved review threads;
- mergeability if available.

Stop before merge.
