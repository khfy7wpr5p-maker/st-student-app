import test from "node:test";
import assert from "node:assert/strict";

import { decodeFirestorePackage } from "../src/providers/firebase/firestorePackageTransport.js";

async function loadSeedModule() {
  try {
    return await import("../scripts/student06SeedFixture.js");
  } catch {
    return {};
  }
}

function fieldValue(write, field) {
  return write.update.fields[field];
}

function utf8BytesFromWrite(write) {
  return Uint8Array.from(
    Buffer.from(fieldValue(write, "data").bytesValue, "base64"),
  );
}

test("STUDENT-06 seed plan builds exact public/private manifests with non-empty required fields", async () => {
  const { buildStudent06SeedPlan } = await loadSeedModule();
  assert.equal(typeof buildStudent06SeedPlan, "function");

  const plan = buildStudent06SeedPlan({
    projectId: "st-student-app-test",
    studentId: "uid-student-a",
    publishedAt: "2026-09-22T00:00:00Z",
  });

  assert.equal(plan.writes.length, 4);

  const publicManifest = plan.writes.find((write) =>
    write.update.name.endsWith("/publicPublications/pub-test-public"),
  );
  const privateManifest = plan.writes.find((write) =>
    write.update.name.endsWith(
      "/students/uid-student-a/publications/pub-test-private",
    ),
  );

  assert.ok(publicManifest);
  assert.ok(privateManifest);
  assert.equal(
    fieldValue(publicManifest, "packageId").stringValue,
    "pkg-test-public",
  );
  assert.equal(
    fieldValue(privateManifest, "packageId").stringValue,
    "pkg-test-private",
  );
  assert.equal(
    fieldValue(privateManifest, "publishedAt").stringValue,
    "2026-09-22T00:00:00Z",
  );
  assert.equal(
    fieldValue(privateManifest, "recipientStudentId").stringValue,
    "uid-student-a",
  );
  assert.equal(
    "recipientStudentId" in publicManifest.update.fields,
    false,
  );
});

test("STUDENT-06 seed chunks reconstruct publishable packages for public and private work", async () => {
  const { buildStudent06SeedPlan } = await loadSeedModule();
  assert.equal(typeof buildStudent06SeedPlan, "function");

  const plan = buildStudent06SeedPlan({
    projectId: "st-student-app-test",
    studentId: "uid-student-a",
    publishedAt: "2026-09-22T00:00:00Z",
  });

  for (const fixture of [
    {
      publicationId: "pub-test-public",
      packageId: "pkg-test-public",
      path: "/publicPublications/pub-test-public",
      expectedScope: "public_pool",
    },
    {
      publicationId: "pub-test-private",
      packageId: "pkg-test-private",
      path: "/students/uid-student-a/publications/pub-test-private",
      expectedScope: "student_private",
    },
  ]) {
    const manifestWrite = plan.writes.find((write) =>
      write.update.name.endsWith(fixture.path),
    );
    const chunkWrite = plan.writes.find((write) =>
      write.update.name.endsWith(`${fixture.path}/chunks/0`),
    );

    assert.ok(manifestWrite);
    assert.ok(chunkWrite);

    const fields = manifestWrite.update.fields;
    const pkg = decodeFirestorePackage({
      manifest: {
        representationVersion: fields.representationVersion.stringValue,
        encoding: fields.encoding.stringValue,
        chunkCount: Number(fields.chunkCount.integerValue),
        totalBytes: Number(fields.totalBytes.integerValue),
      },
      chunks: [
        {
          index: Number(fieldValue(chunkWrite, "index").integerValue),
          data: utf8BytesFromWrite(chunkWrite),
        },
      ],
    });

    assert.equal(pkg.packageId, fixture.packageId);
    assert.equal(pkg.publication.scope, fixture.expectedScope);

    if (fixture.expectedScope === "student_private") {
      assert.equal(pkg.publication.recipientStudentId, "uid-student-a");
    } else {
      assert.equal("recipientStudentId" in pkg.publication, false);
    }
  }
});

test("STUDENT-06 seed plan rejects unsafe identifiers and is bounded to known test documents", async () => {
  const { buildStudent06SeedPlan } = await loadSeedModule();
  assert.equal(typeof buildStudent06SeedPlan, "function");

  assert.throws(
    () =>
      buildStudent06SeedPlan({
        projectId: "../other-project",
        studentId: "uid/student",
        publishedAt: "2026-09-22T00:00:00Z",
      }),
    /projectId|studentId/i,
  );

  const plan = buildStudent06SeedPlan({
    projectId: "st-student-app-test",
    studentId: "uid-student-a",
    publishedAt: "2026-09-22T00:00:00Z",
  });

  assert.deepEqual(
    plan.writes.map((write) =>
      write.update.name.split("/documents/").at(-1),
    ),
    [
      "publicPublications/pub-test-public",
      "publicPublications/pub-test-public/chunks/0",
      "students/uid-student-a/publications/pub-test-private",
      "students/uid-student-a/publications/pub-test-private/chunks/0",
    ],
  );
});
