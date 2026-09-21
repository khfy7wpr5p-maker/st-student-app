import test from "node:test";
import assert from "node:assert/strict";

import {
  FIRESTORE_PACKAGE_REPRESENTATION_VERSION,
  MAX_FIRESTORE_CHUNK_BYTES,
  decodeFirestorePackage,
} from "../src/providers/firebase/firestorePackageTransport.js";
import { makeApprovedPracticePackage } from "./support/practiceFixtures.js";

function encodeFixture(pkg, maxChunkBytes = 64) {
  const bytes = new TextEncoder().encode(JSON.stringify(pkg));
  const chunks = [];

  for (let offset = 0, index = 0; offset < bytes.length; index += 1) {
    const next = bytes.slice(offset, offset + maxChunkBytes);
    chunks.push({ index, data: next });
    offset += next.byteLength;
  }

  return {
    manifest: {
      representationVersion: FIRESTORE_PACKAGE_REPRESENTATION_VERSION,
      encoding: "utf-8-json",
      chunkCount: chunks.length,
      totalBytes: bytes.byteLength,
    },
    chunks,
  };
}

test("manifest chunks reconstruct exactly one validated Practice Package", () => {
  const pkg = makeApprovedPracticePackage();
  const fixture = encodeFixture(pkg, 64);

  assert.deepEqual(decodeFirestorePackage(fixture), pkg);
});

test("Firebase Bytes-like chunk payload is accepted", () => {
  const pkg = makeApprovedPracticePackage();
  const fixture = encodeFixture(pkg, 64);
  fixture.chunks = fixture.chunks.map((chunk) => ({
    ...chunk,
    data: {
      toUint8Array() {
        return chunk.data;
      },
    },
  }));

  assert.deepEqual(decodeFirestorePackage(fixture), pkg);
});

test("transport rejects missing, duplicate, and out-of-range chunk indices", () => {
  const missing = encodeFixture(makeApprovedPracticePackage(), 32);
  missing.chunks.pop();
  assert.throws(() => decodeFirestorePackage(missing));

  const duplicate = encodeFixture(makeApprovedPracticePackage(), 32);
  duplicate.chunks[1] = { ...duplicate.chunks[1], index: 0 };
  assert.throws(() => decodeFirestorePackage(duplicate));

  const outOfRange = encodeFixture(makeApprovedPracticePackage(), 32);
  outOfRange.chunks[0] = {
    ...outOfRange.chunks[0],
    index: outOfRange.manifest.chunkCount,
  };
  assert.throws(() => decodeFirestorePackage(outOfRange));
});

test("transport rejects a chunk larger than 256 KiB", () => {
  const huge = new Uint8Array(MAX_FIRESTORE_CHUNK_BYTES + 1);

  assert.throws(() =>
    decodeFirestorePackage({
      manifest: {
        representationVersion: FIRESTORE_PACKAGE_REPRESENTATION_VERSION,
        encoding: "utf-8-json",
        chunkCount: 1,
        totalBytes: huge.byteLength,
      },
      chunks: [{ index: 0, data: huge }],
    }),
  );
});

test("transport rejects declared byte mismatch, invalid JSON, and invalid package", () => {
  const mismatch = encodeFixture(makeApprovedPracticePackage(), 64);
  mismatch.manifest.totalBytes += 1;
  assert.throws(() => decodeFirestorePackage(mismatch));

  const invalidJson = new TextEncoder().encode("{");
  assert.throws(() =>
    decodeFirestorePackage({
      manifest: {
        representationVersion: FIRESTORE_PACKAGE_REPRESENTATION_VERSION,
        encoding: "utf-8-json",
        chunkCount: 1,
        totalBytes: invalidJson.byteLength,
      },
      chunks: [{ index: 0, data: invalidJson }],
    }),
  );

  const invalidPackage = encodeFixture({ not: "a practice package" }, 64);
  assert.throws(() => decodeFirestorePackage(invalidPackage));
});
