const DEFAULT_SOURCE_REVISION = "298ddd61ba3854231ff7e59a88c22c4a01530a41";
const DEFAULT_RUNTIME_VERSION = "0.2.0";
const DEFAULT_CONTRACT_VERSION = "0.2.0";

function safeRuntime(getRuntime) {
  try {
    return getRuntime?.() ?? null;
  } catch {
    return null;
  }
}

function isSameOriginUrl(value, documentObject) {
  if (typeof value !== "string" || value.length === 0) return false;

  try {
    const base = new URL(documentObject?.baseURI ?? "https://student.invalid/");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin;
  } catch {
    return false;
  }
}

function isPinnedManifest(
  manifest,
  {
    expectedSourceRevision,
    expectedRuntimeVersion,
    expectedContractVersion,
  },
) {
  return Boolean(
    manifest &&
      manifest.schemaVersion === 1 &&
      manifest.runtimeTarget === "student-static" &&
      manifest.audioEngineSourceRevision === expectedSourceRevision &&
      manifest.browserRuntimeVersion === expectedRuntimeVersion &&
      manifest.publicContractVersion === expectedContractVersion &&
      Array.isArray(manifest.assets) &&
      manifest.assets.some(
        (asset) =>
          asset?.path === "st-score-audio-engine.js" &&
          Number.isInteger(asset.bytes) &&
          asset.bytes > 0 &&
          typeof asset.sha256 === "string" &&
          /^[a-f0-9]{64}$/i.test(asset.sha256),
      ),
  );
}

function isRuntime(runtime, expectedRuntimeVersion) {
  return Boolean(
    runtime &&
      runtime.version === expectedRuntimeVersion &&
      typeof runtime.createAudioEngine === "function",
  );
}

export function createScoreAudioRuntimeLoader({
  manifestUrl = null,
  runtimeUrl = null,
  expectedSourceRevision = DEFAULT_SOURCE_REVISION,
  expectedRuntimeVersion = DEFAULT_RUNTIME_VERSION,
  expectedContractVersion = DEFAULT_CONTRACT_VERSION,
  fetchImpl = globalThis.fetch,
  documentObject = globalThis.document,
  getRuntime = () => globalThis.STScoreAudioEngine,
} = {}) {
  let loadPromise = null;

  function canInstall() {
    return Boolean(
      typeof fetchImpl === "function" &&
        documentObject?.createElement &&
        documentObject?.head?.append &&
        isSameOriginUrl(manifestUrl, documentObject) &&
        isSameOriginUrl(runtimeUrl, documentObject),
    );
  }

  function appendRuntimeScript() {
    return new Promise((resolve, reject) => {
      try {
        const script = documentObject.createElement("script");
        script.async = false;
        script.src = runtimeUrl;
        script.addEventListener?.("load", () => resolve(), { once: true });
        script.addEventListener?.(
          "error",
          () => reject(new Error("score audio runtime load failed")),
          { once: true },
        );
        documentObject.head.append(script);
      } catch {
        reject(new Error("score audio runtime load failed"));
      }
    });
  }

  async function install() {
    if (!canInstall()) return null;

    // A pre-existing global has unknown provenance. Only this loader may claim it.
    if (safeRuntime(getRuntime) !== null) return null;

    try {
      const response = await fetchImpl(manifestUrl);
      if (!response?.ok || typeof response.json !== "function") return null;

      const manifest = await response.json();
      if (
        !isPinnedManifest(manifest, {
          expectedSourceRevision,
          expectedRuntimeVersion,
          expectedContractVersion,
        })
      ) {
        return null;
      }

      // Reject a competing/duplicate global that appeared while the manifest loaded.
      if (safeRuntime(getRuntime) !== null) return null;

      await appendRuntimeScript();
      const runtime = safeRuntime(getRuntime);
      return isRuntime(runtime, expectedRuntimeVersion) ? runtime : null;
    } catch {
      return null;
    }
  }

  function load() {
    if (loadPromise === null) {
      loadPromise = install();
    }
    return loadPromise;
  }

  return Object.freeze({
    load,
  });
}
