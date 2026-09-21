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


test("revokedAt must be null or a non-empty string", () => {
  assert.throws(
    () =>
      createPublication({
        publicationId: "pub-revoked-invalid",
        packageId: "pkg-001",
        scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        publishedAt: "2026-09-21T16:00:00Z",
        revokedAt: "   ",
      }),
    /revokedAt must be null or a non-empty string/,
  );
});
