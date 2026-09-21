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

  assert.equal(repo.getByPackageId("pkg-r1").approvedRevision.revisionId, "R1");
  assert.equal(repo.getByPackageId("pkg-r2").approvedRevision.revisionId, "R2");
});

test("package repository stores an immutable snapshot", () => {
  const repo = createInMemoryPackageRepository();
  const source = makePackage({ packageId: "pkg-snapshot" });

  repo.put(source);
  source.title = "Mutated outside repository";
  source.approvedRevision.revisionId = "R99";

  const stored = repo.getByPackageId("pkg-snapshot");
  assert.equal(stored.title, "Etüt 1");
  assert.equal(stored.approvedRevision.revisionId, "R1");
  assert.equal(Object.isFrozen(stored), true);
  assert.equal(Object.isFrozen(stored.approvedRevision), true);
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
