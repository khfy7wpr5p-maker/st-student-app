import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const RUNTIME_ROOT = new URL("../vendor/st-violin-learning/", import.meta.url);
const EXPECTED_SOURCE_SHA = "0ec3f3252111db10f9f381d22d29e57fa8cc2c6f";

test("vendored violin learning runtime matches pinned provenance and integrity manifest", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("runtime-manifest.json", RUNTIME_ROOT), "utf8"),
  );

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceRepository, "khfy7wpr5p-maker/st-violin-learning-engine");
  assert.equal(manifest.sourceCommit, EXPECTED_SOURCE_SHA);
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.contract, "VIOLIN-02");

  const expectedPaths = [
    "src/firstPosition.js",
    "src/followSnapshot.js",
    "src/index.js",
  ];
  assert.deepEqual(
    manifest.files.map((entry) => entry.path).sort(),
    expectedPaths,
  );

  for (const entry of manifest.files) {
    const bytes = await readFile(new URL(entry.path, RUNTIME_ROOT));
    assert.equal(bytes.byteLength, entry.bytes, `byte length mismatch: ${entry.path}`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
      `sha256 mismatch: ${entry.path}`,
    );
  }
});

test("vendored violin runtime contains no unlisted executable JavaScript modules", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("runtime-manifest.json", RUNTIME_ROOT), "utf8"),
  );
  const listed = new Set(manifest.files.map((entry) => entry.path));
  const sourceEntries = await readdir(new URL("src/", RUNTIME_ROOT), {
    withFileTypes: true,
  });

  const executable = sourceEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => `src/${entry.name}`)
    .sort();

  assert.deepEqual(executable, [...listed].sort());
});
