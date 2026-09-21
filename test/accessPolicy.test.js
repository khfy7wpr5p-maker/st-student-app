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
