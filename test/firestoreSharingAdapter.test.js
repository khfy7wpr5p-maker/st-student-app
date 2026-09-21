import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { createFirestoreSharingAdapter } from "../src/providers/firebase/firestoreSharingAdapter.js";
import { makeApprovedPracticePackage } from "./support/practiceFixtures.js";

const studentA = createStudentSession({ studentId: "student-a" });

function transportFixture(pkg, publication, title = pkg.title) {
  const bytes = new TextEncoder().encode(JSON.stringify(pkg));
  const chunks = [
    {
      index: 0,
      data: bytes,
    },
  ];

  return {
    manifest: {
      ...publication,
      title,
      representationVersion: "1",
      encoding: "utf-8-json",
      chunkCount: chunks.length,
      totalBytes: bytes.byteLength,
    },
    chunks,
  };
}

function makeSnapshot(id, data) {
  return {
    id,
    exists() {
      return data !== null;
    },
    data() {
      return data;
    },
  };
}

function fakeFirestoreSdk(fixtures, calls) {
  const pathOf = (segments) => segments.join("/");

  return {
    collection(_db, ...segments) {
      const path = pathOf(segments);
      calls.push({ op: "collection", path });
      return { kind: "collection", path };
    },
    doc(_db, ...segments) {
      const path = pathOf(segments);
      calls.push({ op: "doc", path });
      return { kind: "doc", path };
    },
    async getDoc(ref) {
      calls.push({ op: "getDoc", path: ref.path });
      const data = fixtures.docs?.[ref.path] ?? null;
      return makeSnapshot(ref.path.split("/").at(-1), data);
    },
    async getDocs(ref) {
      calls.push({ op: "getDocs", path: ref.path });
      const rows = fixtures.collections?.[ref.path] ?? [];
      return {
        docs: rows.map((row) => makeSnapshot(row.id, row.data)),
      };
    },
  };
}

test("Public Pool and My Work lists are manifest-only", async () => {
  const calls = [];
  const publicPublication = {
    publicationId: "pub-public",
    packageId: "pkg-public",
    scope: "public_pool",
    publishedAt: "2026-09-21T12:00:00Z",
    revokedAt: null,
  };
  const privatePublication = {
    publicationId: "pub-private",
    packageId: "pkg-private",
    scope: "student_private",
    recipientStudentId: "student-a",
    publishedAt: "2026-09-21T12:00:00Z",
    revokedAt: null,
  };

  const adapter = createFirestoreSharingAdapter({
    db: {},
    sdk: fakeFirestoreSdk(
      {
        collections: {
          publicPublications: [
            {
              id: "pub-public",
              data: { ...publicPublication, title: "Public Etüt" },
            },
          ],
          "students/student-a/publications": [
            {
              id: "pub-private",
              data: { ...privatePublication, title: "Özel Etüt" },
            },
          ],
        },
      },
      calls,
    ),
  });

  const publicItems = await adapter.listPublicPool({ session: studentA });
  const privateItems = await adapter.listMyWork({ session: studentA });

  assert.deepEqual(
    publicItems.map((item) => item.package),
    [{ packageId: "pkg-public", title: "Public Etüt" }],
  );
  assert.deepEqual(
    privateItems.map((item) => item.package),
    [{ packageId: "pkg-private", title: "Özel Etüt" }],
  );
  assert.equal(calls.some((call) => call.path.includes("/chunks")), false);
});

test("private Practice read stays under authenticated uid and reconstructs chunks", async () => {
  const calls = [];
  const pkg = makeApprovedPracticePackage({
    packageId: "pkg-private",
    title: "Özel Etüt",
    scope: "student_private",
    recipientStudentId: "student-a",
  });
  const publication = {
    publicationId: "pub-private",
    packageId: "pkg-private",
    scope: "student_private",
    recipientStudentId: "student-a",
    publishedAt: "2026-09-21T12:00:00Z",
    revokedAt: null,
  };
  const fixture = transportFixture(pkg, publication);

  const adapter = createFirestoreSharingAdapter({
    db: {},
    sdk: fakeFirestoreSdk(
      {
        docs: {
          "students/student-a/publications/pub-private":
            fixture.manifest,
        },
        collections: {
          "students/student-a/publications/pub-private/chunks":
            fixture.chunks.map((data, index) => ({
              id: String(index),
              data,
            })),
        },
      },
      calls,
    ),
  });

  const item = await adapter.getPracticeItem({
    session: studentA,
    publicationId: "pub-private",
  });

  assert.equal(item.package.packageId, "pkg-private");
  assert.ok(
    calls.some(
      (call) =>
        call.path ===
        "students/student-a/publications/pub-private",
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.path ===
        "students/student-a/publications/pub-private/chunks",
    ),
  );
  assert.equal(
    calls.some((call) => call.path.includes("students/student-b")),
    false,
  );
});

test("public Practice falls back to public path and revoked package chunks are never read", async () => {
  const calls = [];
  const publication = {
    publicationId: "pub-public",
    packageId: "pkg-public",
    scope: "public_pool",
    publishedAt: "2026-09-21T12:00:00Z",
    revokedAt: "2026-09-21T13:00:00Z",
    title: "Revoked",
    representationVersion: "1",
    encoding: "utf-8-json",
    chunkCount: 1,
    totalBytes: 1,
  };

  const adapter = createFirestoreSharingAdapter({
    db: {},
    sdk: fakeFirestoreSdk(
      {
        docs: {
          "publicPublications/pub-public": publication,
        },
      },
      calls,
    ),
  });

  await assert.rejects(
    () =>
      adapter.getPracticeItem({
        session: studentA,
        publicationId: "pub-public",
      }),
    /revoked|forbidden/i,
  );

  assert.equal(calls.some((call) => call.path.includes("/chunks")), false);
});

test("publication status reports explicit REVOKED without reading chunks", async () => {
  const calls = [];
  const adapter = createFirestoreSharingAdapter({
    db: {},
    sdk: fakeFirestoreSdk(
      {
        docs: {
          "publicPublications/pub-public": {
            publicationId: "pub-public",
            packageId: "pkg-public",
            scope: "public_pool",
            publishedAt: "2026-09-21T12:00:00Z",
            revokedAt: "2026-09-21T13:00:00Z",
            title: "Etüt",
          },
        },
      },
      calls,
    ),
  });

  assert.deepEqual(
    await adapter.getPublicationStatus({
      session: studentA,
      publicationId: "pub-public",
      scope: "public_pool",
    }),
    { state: "REVOKED" },
  );
  assert.equal(calls.some((call) => call.path.includes("/chunks")), false);
});

test("private manifest recipient mismatch fails closed", async () => {
  const adapter = createFirestoreSharingAdapter({
    db: {},
    sdk: fakeFirestoreSdk(
      {
        collections: {
          "students/student-a/publications": [
            {
              id: "pub-private",
              data: {
                publicationId: "pub-private",
                packageId: "pkg-private",
                scope: "student_private",
                recipientStudentId: "student-b",
                publishedAt: "2026-09-21T12:00:00Z",
                revokedAt: null,
                title: "Wrong",
              },
            },
          ],
        },
      },
      [],
    ),
  });

  await assert.rejects(
    () => adapter.listMyWork({ session: studentA }),
    /recipient|forbidden/i,
  );
});
