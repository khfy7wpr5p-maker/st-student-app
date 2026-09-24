import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const REQUIRED_PLAYBACK_MODULES = [
  "./src/playback/playbackPlan.js",
  "./src/playback/musicXmlPlaybackDom.js",
  "./src/playback/musicXmlApproximatePlayback.js",
  "./src/playback/playbackPlanResolver.js",
  "./src/playback/pianoSampleBank.js",
  "./src/playback/webAudioPianoEngine.js",
  "./src/playback/studentPlaybackPort.js",
];

const REQUIRED_PIANO_ASSETS = [
  "./vendor/st-piano/runtime-manifest.json",
  "./vendor/st-piano/LICENSE.txt",
  "./vendor/st-piano/THIRD_PARTY_NOTICES.md",
  "./vendor/st-piano/samples/C4.wav",
  "./vendor/st-piano/samples/Cs4.wav",
  "./vendor/st-piano/samples/D4.wav",
  "./vendor/st-piano/samples/Ds4.wav",
  "./vendor/st-piano/samples/E4.wav",
  "./vendor/st-piano/samples/F4.wav",
  "./vendor/st-piano/samples/Fs4.wav",
  "./vendor/st-piano/samples/G4.wav",
  "./vendor/st-piano/samples/Gs4.wav",
  "./vendor/st-piano/samples/A4.wav",
  "./vendor/st-piano/samples/As4.wav",
  "./vendor/st-piano/samples/B4.wav",
];

test("service worker v13 pins the complete local playback module graph", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /const CACHE_NAME = "st-student-shell-v13"/);
  for (const asset of REQUIRED_PLAYBACK_MODULES) {
    assert.equal(source.includes(`"${asset}"`), true, asset);
  }
});

test("service worker declares exactly the approved piano static asset set", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );
  const match = source.match(
    /const PLAYBACK_STATIC_ASSETS = Object\.freeze\(\[([\s\S]*?)\]\);/,
  );

  assert.notEqual(match, null);
  const assets = [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);

  assert.deepEqual(assets, REQUIRED_PIANO_ASSETS);
  assert.equal(assets.filter((asset) => asset.endsWith(".wav")).length, 12);
  assert.equal(assets.every((asset) => asset.startsWith("./")), true);
  assert.equal(assets.some((asset) => /https?:\/\//i.test(asset)), false);
});

test("playback static cache is best-effort and fetch handling is allowlisted", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /const PLAYBACK_ASSET_PATHS = new Set/);
  assert.match(source, /for\s*\(\s*const asset of PLAYBACK_STATIC_ASSETS\s*\)/);
  assert.match(source, /try\s*\{[\s\S]*?await cache\.add\(asset\)/);
  assert.match(
    source,
    /PLAYBACK_ASSET_PATHS\.has\(url\.pathname\)/,
  );
  assert.doesNotMatch(
    source,
    /Practice Package|indexedDbOfflineRepository.*PLAYBACK_STATIC_ASSETS/i,
  );
});


test("required shell caching completes before best-effort piano caching", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  const shellIndex = source.indexOf("await cache.addAll(SHELL_ASSETS)");
  const playbackIndex = source.indexOf(
    "for (const asset of PLAYBACK_STATIC_ASSETS)",
  );

  assert.ok(shellIndex >= 0);
  assert.ok(playbackIndex > shellIndex);
  assert.match(
    source.slice(playbackIndex),
    /try\s*\{[\s\S]*?await cache\.add\(asset\)[\s\S]*?catch\s*\{/,
  );
  assert.doesNotMatch(
    source,
    /PLAYBACK_STATIC_ASSETS[\s\S]*?(practicePackages|recipientStudentId|approvedRevision)/i,
  );
});
