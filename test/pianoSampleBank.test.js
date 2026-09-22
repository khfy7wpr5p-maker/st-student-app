import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";

import { createPianoSampleBank } from "../src/playback/pianoSampleBank.js";

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


function makeRuntimeManifest(overrides = {}) {
  const samples = expectedFiles.map((file, index) => ({
    midi: 60 + index,
    file: "samples/" + file,
    bytes: 220_544,
    sha256: "0".repeat(64),
  }));

  return {
    schemaVersion: 1,
    generator: "scripts/generate-st-piano-bank.mjs",
    format: "audio/wav; codecs=1",
    sampleRate: 44_100,
    channels: 1,
    bitsPerSample: 16,
    durationFrames: 110_250,
    samples,
    ...overrides,
  };
}

function responseJson(value, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return value;
    },
  };
}

function responseArrayBuffer(byte = 1, { ok = true } = {}) {
  return {
    ok,
    async arrayBuffer() {
      return Uint8Array.of(byte, byte + 1, byte + 2).buffer;
    },
  };
}

test("sample bank initialize validates manifest without decoding audio", async () => {
  const calls = [];
  const bank = createPianoSampleBank({
    fetchImpl: async (url) => {
      calls.push(url);
      return responseJson(makeRuntimeManifest());
    },
  });

  assert.equal(bank.isConfigured(), false);
  assert.equal(await bank.initialize(), true);
  assert.equal(bank.isConfigured(), true);
  assert.deepEqual(calls, ["./vendor/st-piano/runtime-manifest.json"]);
});

test("sample bank rejects invalid or cross-origin manifest graphs", async () => {
  for (const invalid of [
    makeRuntimeManifest({ samples: [] }),
    makeRuntimeManifest({
      samples: makeRuntimeManifest().samples.map((sample, index) =>
        index === 0
          ? { ...sample, file: "https://cdn.example/C4.wav" }
          : sample,
      ),
    }),
    makeRuntimeManifest({
      samples: makeRuntimeManifest().samples.map((sample, index) =>
        index === 0 ? { ...sample, midi: 61 } : sample,
      ),
    }),
  ]) {
    const bank = createPianoSampleBank({
      fetchImpl: async () => responseJson(invalid),
    });

    assert.equal(await bank.initialize(), false);
    assert.equal(bank.isConfigured(), false);
  }
});

test("sample bank loads 12 samples once and resolves MIDI by pitch class", async () => {
  const fetchCalls = [];
  const decoded = [];
  const bank = createPianoSampleBank({
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      if (url.endsWith("runtime-manifest.json")) {
        return responseJson(makeRuntimeManifest());
      }
      return responseArrayBuffer(fetchCalls.length);
    },
  });
  const context = {
    async decodeAudioData(buffer) {
      const value = { id: decoded.length, bytes: buffer.byteLength };
      decoded.push(value);
      return value;
    },
  };

  assert.equal(await bank.initialize(), true);
  await Promise.all([bank.load(context), bank.load(context)]);
  await bank.load(context);

  assert.equal(fetchCalls.length, 13);
  assert.equal(decoded.length, 12);

  assert.deepEqual(bank.resolveMidi(48), {
    buffer: decoded[0],
    playbackRate: 0.5,
    referenceMidi: 60,
  });
  assert.deepEqual(bank.resolveMidi(60), {
    buffer: decoded[0],
    playbackRate: 1,
    referenceMidi: 60,
  });
  assert.deepEqual(bank.resolveMidi(72), {
    buffer: decoded[0],
    playbackRate: 2,
    referenceMidi: 60,
  });
  assert.deepEqual(bank.resolveMidi(61), {
    buffer: decoded[1],
    playbackRate: 1,
    referenceMidi: 61,
  });
});

test("sample bank load failure enters a bounded failed state", async () => {
  const bank = createPianoSampleBank({
    fetchImpl: async (url) =>
      url.endsWith("runtime-manifest.json")
        ? responseJson(makeRuntimeManifest())
        : responseArrayBuffer(1),
  });
  const context = {
    async decodeAudioData() {
      throw new Error("provider decode secret");
    },
  };

  assert.equal(await bank.initialize(), true);
  await assert.rejects(() => bank.load(context), /piano sample load failed/);
  assert.equal(bank.isConfigured(), false);
  await assert.rejects(() => bank.load(context), /piano sample bank unavailable/);
  assert.throws(() => bank.resolveMidi(60), /piano sample bank unavailable/);
});

test("dispose invalidates slow sample load completion", async () => {
  let releaseDecode;
  const decodeGate = new Promise((resolve) => {
    releaseDecode = resolve;
  });
  const bank = createPianoSampleBank({
    fetchImpl: async (url) =>
      url.endsWith("runtime-manifest.json")
        ? responseJson(makeRuntimeManifest())
        : responseArrayBuffer(1),
  });
  const context = {
    async decodeAudioData() {
      await decodeGate;
      return { decoded: true };
    },
  };

  assert.equal(await bank.initialize(), true);
  const pending = bank.load(context);
  bank.dispose();
  releaseDecode();

  await assert.rejects(() => pending, /piano sample load stale/);
  assert.equal(bank.isConfigured(), false);
  assert.throws(() => bank.resolveMidi(60), /piano sample bank unavailable/);
});
