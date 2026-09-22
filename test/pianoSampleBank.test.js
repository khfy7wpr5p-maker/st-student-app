import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";

const bankRoot = new URL("../vendor/st-piano/", import.meta.url);
const samplesRoot = new URL("./samples/", bankRoot);

const expectedFiles = Object.freeze([
  "C4.wav",
  "Cs4.wav",
  "D4.wav",
  "Ds4.wav",
  "E4.wav",
  "F4.wav",
  "Fs4.wav",
  "G4.wav",
  "Gs4.wav",
  "A4.wav",
  "As4.wav",
  "B4.wav",
]);

function u16le(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function u32le(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

test("piano bank contains exactly 12 deterministic PCM16 WAV references", async () => {
  const files = (await readdir(samplesRoot)).sort();
  assert.deepEqual(files, [...expectedFiles].sort());

  for (const file of files) {
    const bytes = await readFile(new URL(file, samplesRoot));

    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(bytes.subarray(12, 16).toString("ascii"), "fmt ");
    assert.equal(u16le(bytes, 20), 1);
    assert.equal(u16le(bytes, 22), 1);
    assert.equal(u32le(bytes, 24), 44_100);
    assert.equal(u16le(bytes, 34), 16);
    assert.equal(bytes.subarray(36, 40).toString("ascii"), "data");

    const dataBytes = u32le(bytes, 40);
    assert.equal(dataBytes / 2, 110_250);
    assert.equal(bytes.length, 44 + dataBytes);
  }
});

test("piano bank manifest matches bytes and SHA-256 for MIDI 60 through 71", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("./runtime-manifest.json", bankRoot), "utf8"),
  );

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.generator, "scripts/generate-st-piano-bank.mjs");
  assert.equal(manifest.format, "audio/wav; codecs=1");
  assert.equal(manifest.sampleRate, 44_100);
  assert.equal(manifest.channels, 1);
  assert.equal(manifest.bitsPerSample, 16);
  assert.equal(manifest.durationFrames, 110_250);
  assert.equal(manifest.samples.length, 12);

  for (let index = 0; index < manifest.samples.length; index += 1) {
    const entry = manifest.samples[index];
    const expectedFile = expectedFiles[index];

    assert.deepEqual(
      { midi: entry.midi, file: entry.file },
      { midi: 60 + index, file: `samples/${expectedFile}` },
    );

    const bytes = await readFile(new URL(entry.file, bankRoot));
    const digest = createHash("sha256").update(bytes).digest("hex");

    assert.equal(entry.bytes, bytes.length);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.sha256, digest);
  }
});

test("complete piano bank stays below the 8 MiB static asset budget", async () => {
  let total = 0;

  for (const file of expectedFiles) {
    total += (await stat(new URL(file, samplesRoot))).size;
  }

  assert.ok(total <= 8 * 1024 * 1024, `bank bytes: ${total}`);
});

test("piano provenance contains no third-party audio dependency", async () => {
  const license = await readFile(new URL("./LICENSE.txt", bankRoot), "utf8");
  const notices = await readFile(
    new URL("./THIRD_PARTY_NOTICES.md", bankRoot),
    "utf8",
  );

  assert.match(license, /deterministically generated/i);
  assert.match(notices, /no third-party audio/i);
  assert.match(notices, /generate-st-piano-bank\.mjs/);
  assert.doesNotMatch(notices, /https?:\/\/|cdn/i);
});
