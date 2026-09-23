import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const RUNTIME_ROOT = new URL("../vendor/st-score-runtime/", import.meta.url);

test("vendored ST score runtime matches its pinned provenance and integrity manifest", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("runtime-manifest.json", RUNTIME_ROOT), "utf8"),
  );

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(
    manifest.rendererSourceRevision,
    "78eec1d958923e871b5069f5026eed9e4ead2c33",
  );
  assert.equal(manifest.scoreRendererContractVersion, "0.2.0");
  assert.equal(manifest.runtimeTarget, "browser");
  assert.equal(manifest.vendor?.opensheetmusicdisplay?.version, "2.1.2");
  assert.equal(manifest.vendor?.opensheetmusicdisplay?.license, "BSD-3-Clause");
  assert.equal(manifest.files.length, 10);

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

test("vendored browser bootstrap remains local, root-bound, and contract-ready", async () => {
  const source = await readFile(
    new URL("browser-bootstrap.mjs", RUNTIME_ROOT),
    "utf8",
  );

  assert.match(source, /document\.getElementById\(["']st-score-root["']\)/);
  assert.match(source, /globalThis\.__ST_SCORE_RENDER_HOST__\s*=\s*runtimeHost/);
  assert.match(source, /st-score-render-host-ready/);
  assert.match(source, /contractVersion:\s*SCORE_RENDERER_CONTRACT_VERSION/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//i);
});


test("vendored runtime CSP rejects unsafe-inline and pins generated hashes", async () => {
  const source = await readFile(
    new URL("index.html", RUNTIME_ROOT),
    "utf8",
  );

  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /script-src 'self' 'sha256-[^']+'/);
  assert.match(source, /style-src 'sha256-[^']+'/);
  assert.doesNotMatch(source, /'unsafe-inline'/);
});
