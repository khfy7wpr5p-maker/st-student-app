import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test("vendored Score Audio runtime is exact 0.2.0 pinned source evidence", async () => {
  const base = new URL("../vendor/st-score-audio/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("runtime-manifest.json", base), "utf8"),
  );
  const bundle = await readFile(
    new URL("st-score-audio-engine.js", base),
  );
  const digest = createHash("sha256").update(bundle).digest("hex");

  assert.equal(manifest.runtimeVersion, "0.2.0");
  assert.equal(manifest.publicContractVersion, "0.2.0");
  assert.equal(
    manifest.sourceRevision,
    "4f5d78a3e54a6f005a4c4d810e8ff404a988b0a5",
  );
  assert.equal(bundle.byteLength, manifest.bundle.bytes);
  assert.equal(digest, manifest.bundle.sha256);
  assert.match(bundle.toString("utf8"), /STScoreAudioEngine/);
});
