import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { PRACTICE_PACKAGE_SCOPES } from "../src/contracts/practicePackage.js";
import { createInMemoryPackageRepository } from "../src/sharing/inMemoryPackageRepository.js";
import { createInMemoryPublicationRepository } from "../src/sharing/inMemoryPublicationRepository.js";
import { createPublication } from "../src/sharing/publication.js";
import { createSharingService } from "../src/sharing/sharingService.js";

function makePackage({
  packageId = "pkg-public",
  revisionId = "R1",
  scope = PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
  recipientStudentId,
} = {}) {
  const publication =
    scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE
      ? { scope, recipientStudentId }
      : { scope };

  return {
    schemaVersion: "1.0.0",
    packageId,
    workId: "work-001",
    title: "Etüt 1",
    approvedRevision: {
      revisionId,
      state: "teacher_approved",
      approvedAt: "2026-09-21T12:00:00Z",
    },
    publication,
    content: {
      score: {
        format: "musicxml",
        data: "<score-partwise version=\"4.0\"></score-partwise>",
      },
      canonicalEvents: [],
    },
  };
}

function makeEmptyService() {
  const packageRepository = createInMemoryPackageRepository();
  const publicationRepository = createInMemoryPublicationRepository();
  const service = createSharingService({
    packageRepository,
    publicationRepository,
  });
  const studentA = createStudentSession({ studentId: "student-a" });
  const studentB = createStudentSession({ studentId: "student-b" });

  return {
    service,
    packageRepository,
    publicationRepository,
    studentA,
    studentB,
  };
}

function makeServiceWithPublicItem() {
  const state = makeEmptyService();
  const pkg = makePackage();
  const publication = createPublication({
    publicationId: "pub-public",
    packageId: pkg.packageId,
    scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    publishedAt: "2026-09-21T16:00:00Z",
  });

  state.service.publish({ package: pkg, publication });
  return state;
}

function makeServiceWithPrivateItems() {
  const state = makeEmptyService();

  const packageA = makePackage({
    packageId: "pkg-a",
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: "student-a",
  });
  const publicationA = createPublication({
    publicationId: "pub-a",
    packageId: packageA.packageId,
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: "student-a",
    publishedAt: "2026-09-21T16:00:00Z",
  });

  const packageB = makePackage({
    packageId: "pkg-b",
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: "student-b",
  });
  const publicationB = createPublication({
    publicationId: "pub-b",
    packageId: packageB.packageId,
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: "student-b",
    publishedAt: "2026-09-21T16:00:00Z",
  });

  state.service.publish({ package: packageA, publication: publicationA });
  state.service.publish({ package: packageB, publication: publicationB });

  return {
    ...state,
    studentBPublicationId: publicationB.publicationId,
  };
}

test("unauthenticated caller cannot query Public Pool", () => {
  const { service } = makeServiceWithPublicItem();

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
  const { service } = makeEmptyService();
  const pkg = makePackage();
  pkg.approvedRevision.state = "teacher_corrected";

  const publication = createPublication({
    publicationId: "pub-invalid",
    packageId: pkg.packageId,
    scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    publishedAt: "2026-09-21T16:00:00Z",
  });

  assert.throws(
    () => service.publish({ package: pkg, publication }),
    /teacher_approved/,
  );
});

test("publish rejects publication scope that contradicts package metadata", () => {
  const { service } = makeEmptyService();
  const pkg = makePackage({
    packageId: "pkg-private",
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: "student-a",
  });
  const publication = createPublication({
    publicationId: "pub-contradiction",
    packageId: pkg.packageId,
    scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    publishedAt: "2026-09-21T16:00:00Z",
  });

  assert.throws(
    () => service.publish({ package: pkg, publication }),
    /publication does not match package publication metadata/,
  );
});

test("publish rejects a different private recipient than package metadata", () => {
  const { service } = makeEmptyService();
  const pkg = makePackage({
    packageId: "pkg-private",
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: "student-a",
  });
  const publication = createPublication({
    publicationId: "pub-private",
    packageId: pkg.packageId,
    scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
    recipientStudentId: "student-b",
    publishedAt: "2026-09-21T16:00:00Z",
  });

  assert.throws(
    () => service.publish({ package: pkg, publication }),
    /publication does not match package publication metadata/,
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
