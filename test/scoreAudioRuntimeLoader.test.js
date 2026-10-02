import test from "node:test";
import assert from "node:assert/strict";

import { createScoreAudioRuntimeLoader } from "../src/playback/scoreAudioRuntimeLoader.js";

const SOURCE_REVISION = "298ddd61ba3854231ff7e59a88c22c4a01530a41";
const RUNTIME_VERSION = "0.2.0";
const CONTRACT_VERSION = "0.2.0";
const RUNTIME_BYTES = 22499;
const RUNTIME_SHA256 = "babf2a12d2c1000a8bc781c084c844b1dcd8cf4072ce9d56f273888a4782efe5";
const RUNTIME_INTEGRITY = "sha256-ur8qEtLBAAqLx4HAhMhEsdzYz0Byzp1W8nOIikeC7+U=";

function createManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    runtimeTarget: "student-static",
    audioEngineSourceRevision: SOURCE_REVISION,
    browserRuntimeVersion: RUNTIME_VERSION,
    publicContractVersion: CONTRACT_VERSION,
    assets: [
      {
        path: "st-score-audio-engine.js",
        bytes: RUNTIME_BYTES,
        sha256: RUNTIME_SHA256,
      },
    ],
    ...overrides,
  };
}

function createFakeDocument({ onAppend } = {}) {
  const appended = [];

  return {
    baseURI: "https://student.example/app/",
    appended,
    createElement(tagName) {
      assert.equal(tagName, "script");
      const listeners = new Map();
      return {
        async: false,
        src: "",
        integrity: "",
        addEventListener(type, listener) {
          listeners.set(type, listener);
        },
        dispatch(type) {
          listeners.get(type)?.();
        },
      };
    },
    head: {
      append(script) {
        appended.push(script);
        onAppend?.(script);
      },
    },
  };
}

function createSuccessfulFetch(manifest = createManifest()) {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        return manifest;
      },
    };
  };
  return {
    fetchImpl,
    get calls() {
      return calls;
    },
  };
}

function createLoader({
  documentObject,
  fetchImpl,
  getRuntime,
  manifestUrl = "./vendor/st-score-audio/runtime-manifest.json",
  runtimeUrl = "./vendor/st-score-audio/st-score-audio-engine.js",
} = {}) {
  return createScoreAudioRuntimeLoader({
    documentObject,
    fetchImpl,
    getRuntime,
    manifestUrl,
    runtimeUrl,
    expectedSourceRevision: SOURCE_REVISION,
    expectedRuntimeVersion: RUNTIME_VERSION,
    expectedContractVersion: CONTRACT_VERSION,
    expectedRuntimeBytes: RUNTIME_BYTES,
    expectedRuntimeSha256: RUNTIME_SHA256,
    expectedRuntimeIntegrity: RUNTIME_INTEGRITY,
  });
}

test("loader accepts only the exact pinned manifest and returns the loaded runtime", async () => {
  let runtime = null;
  const fetchState = createSuccessfulFetch();
  const documentObject = createFakeDocument({
    onAppend(script) {
      runtime = Object.freeze({
        version: RUNTIME_VERSION,
        createAudioEngine() {},
      });
      script.dispatch("load");
    },
  });
  const loader = createLoader({
    documentObject,
    fetchImpl: fetchState.fetchImpl,
    getRuntime: () => runtime,
  });

  const loaded = await loader.load();

  assert.strictEqual(loaded, runtime);
  assert.equal(fetchState.calls, 1);
  assert.equal(documentObject.appended.length, 1);
  assert.equal(
    documentObject.appended[0].src,
    "./vendor/st-score-audio/st-score-audio-engine.js",
  );
  assert.equal(documentObject.appended[0].integrity, RUNTIME_INTEGRITY);
});

test("loader is single-flight and injects the runtime script only once", async () => {
  let runtime = null;
  let releaseFetch;
  let fetchCalls = 0;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const documentObject = createFakeDocument({
    onAppend(script) {
      runtime = Object.freeze({
        version: RUNTIME_VERSION,
        createAudioEngine() {},
      });
      script.dispatch("load");
    },
  });
  const loader = createLoader({
    documentObject,
    fetchImpl: async () => {
      fetchCalls += 1;
      await fetchGate;
      return {
        ok: true,
        async json() {
          return createManifest();
        },
      };
    },
    getRuntime: () => runtime,
  });

  const first = loader.load();
  const second = loader.load();

  assert.strictEqual(first, second);
  releaseFetch();

  const [firstRuntime, secondRuntime] = await Promise.all([first, second]);
  assert.strictEqual(firstRuntime, runtime);
  assert.strictEqual(secondRuntime, runtime);
  assert.equal(fetchCalls, 1);
  assert.equal(documentObject.appended.length, 1);
});

test("loader rejects source, runtime, contract, or runtime-asset pin mismatches before script injection", async (t) => {
  const cases = [
    ["source revision", { audioEngineSourceRevision: "stale" }],
    ["runtime version", { browserRuntimeVersion: "0.1.0" }],
    ["contract version", { publicContractVersion: "0.1.0" }],
    [
      "runtime bytes",
      {
        assets: [
          {
            path: "st-score-audio-engine.js",
            bytes: RUNTIME_BYTES + 1,
            sha256: RUNTIME_SHA256,
          },
        ],
      },
    ],
    [
      "runtime hash",
      {
        assets: [
          {
            path: "st-score-audio-engine.js",
            bytes: RUNTIME_BYTES,
            sha256: "0".repeat(64),
          },
        ],
      },
    ],
  ];

  for (const [name, overrides] of cases) {
    await t.test(name, async () => {
      const documentObject = createFakeDocument();
      const loader = createLoader({
        documentObject,
        fetchImpl: createSuccessfulFetch(createManifest(overrides)).fetchImpl,
        getRuntime: () => null,
      });

      assert.equal(await loader.load(), null);
      assert.equal(documentObject.appended.length, 0);
    });
  }
});

test("loader rejects cross-origin manifest or runtime URLs without fetching or injecting", async (t) => {
  for (const config of [
    { manifestUrl: "https://evil.example/runtime-manifest.json" },
    { runtimeUrl: "https://evil.example/st-score-audio-engine.js" },
  ]) {
    await t.test(JSON.stringify(config), async () => {
      let fetchCalls = 0;
      const documentObject = createFakeDocument();
      const loader = createLoader({
        documentObject,
        fetchImpl: async () => {
          fetchCalls += 1;
          return { ok: true, json: async () => createManifest() };
        },
        getRuntime: () => null,
        ...config,
      });

      assert.equal(await loader.load(), null);
      assert.equal(fetchCalls, 0);
      assert.equal(documentObject.appended.length, 0);
    });
  }
});

test("loader rejects a pre-existing global because its provenance is not loader-owned", async () => {
  const runtime = Object.freeze({
    version: RUNTIME_VERSION,
    createAudioEngine() {},
  });
  const documentObject = createFakeDocument();
  const fetchState = createSuccessfulFetch();
  const loader = createLoader({
    documentObject,
    fetchImpl: fetchState.fetchImpl,
    getRuntime: () => runtime,
  });

  assert.equal(await loader.load(), null);
  assert.equal(fetchState.calls, 0);
  assert.equal(documentObject.appended.length, 0);
});

test("loader rejects a missing or mismatched runtime global after script load", async (t) => {
  for (const runtimeAfterLoad of [
    null,
    Object.freeze({ version: "0.1.0", createAudioEngine() {} }),
    Object.freeze({ version: RUNTIME_VERSION }),
  ]) {
    await t.test(String(runtimeAfterLoad?.version ?? "missing"), async () => {
      let runtime = null;
      const documentObject = createFakeDocument({
        onAppend(script) {
          runtime = runtimeAfterLoad;
          script.dispatch("load");
        },
      });
      const loader = createLoader({
        documentObject,
        fetchImpl: createSuccessfulFetch().fetchImpl,
        getRuntime: () => runtime,
      });

      assert.equal(await loader.load(), null);
    });
  }
});
