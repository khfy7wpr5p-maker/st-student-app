const EXPECTED_SAMPLE_COUNT = 12;
const FIRST_REFERENCE_MIDI = 60;
const LAST_REFERENCE_MIDI = 71;
const MAX_BANK_BYTES = 8 * 1024 * 1024;

function relativeManifestPath(value) {
  return (
    typeof value === "string" &&
    value.startsWith("./") &&
    !value.includes("://") &&
    !value.includes("\\") &&
    !value.includes("..") &&
    !value.includes("#")
  );
}

function relativeSamplePath(value) {
  return (
    typeof value === "string" &&
    /^samples\/[A-Za-z0-9_-]+\.wav$/.test(value)
  );
}

function validSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function normalizeManifest(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    value.format !== "audio/wav; codecs=1" ||
    value.sampleRate !== 44_100 ||
    value.channels !== 1 ||
    value.bitsPerSample !== 16 ||
    value.durationFrames !== 110_250 ||
    !Array.isArray(value.samples) ||
    value.samples.length !== EXPECTED_SAMPLE_COUNT
  ) {
    return null;
  }

  let totalBytes = 0;
  const samples = [];

  for (let index = 0; index < value.samples.length; index += 1) {
    const sample = value.samples[index];
    const expectedMidi = FIRST_REFERENCE_MIDI + index;

    if (
      sample === null ||
      typeof sample !== "object" ||
      Array.isArray(sample) ||
      sample.midi !== expectedMidi ||
      !relativeSamplePath(sample.file) ||
      !Number.isInteger(sample.bytes) ||
      sample.bytes <= 44 ||
      !validSha256(sample.sha256)
    ) {
      return null;
    }

    totalBytes += sample.bytes;

    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_BANK_BYTES) {
      return null;
    }

    samples.push(
      Object.freeze({
        midi: sample.midi,
        file: sample.file,
        bytes: sample.bytes,
        sha256: sample.sha256,
      }),
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    samples: Object.freeze(samples),
  });
}

function sampleUrl(manifestUrl, file) {
  const slash = manifestUrl.lastIndexOf("/");
  const base = slash >= 0 ? manifestUrl.slice(0, slash + 1) : "./";
  return base + file;
}

function unavailableError() {
  return new Error("piano sample bank unavailable");
}

function staleError() {
  return new Error("piano sample load stale");
}

function loadFailedError() {
  return new Error("piano sample load failed");
}

export function createPianoSampleBank({
  manifestUrl = "./vendor/st-piano/runtime-manifest.json",
  fetchImpl = globalThis.fetch,
} = {}) {
  let manifest = null;
  let initialized = false;
  let failed = false;
  let disposed = false;
  let initializePromise = null;
  let loadPromise = null;
  let generation = 0;
  const buffers = new Map();

  function configured() {
    return initialized && manifest !== null && !failed && !disposed;
  }

  async function initializeNow() {
    if (
      failed ||
      disposed ||
      !relativeManifestPath(manifestUrl) ||
      typeof fetchImpl !== "function"
    ) {
      return false;
    }

    if (configured()) {
      return true;
    }

    try {
      const response = await fetchImpl(manifestUrl);

      if (response?.ok !== true || typeof response?.json !== "function") {
        throw new Error("manifest unavailable");
      }

      const normalized = normalizeManifest(await response.json());

      if (normalized === null) {
        throw new Error("manifest invalid");
      }

      manifest = normalized;
      initialized = true;
      return true;
    } catch {
      failed = true;
      manifest = null;
      initialized = false;
      return false;
    }
  }

  async function loadNow(audioContext, capturedGeneration) {
    const okay = configured() || (await initializeNow());

    if (!okay || failed || disposed) {
      throw unavailableError();
    }

    if (
      audioContext === null ||
      typeof audioContext !== "object" ||
      typeof audioContext.decodeAudioData !== "function"
    ) {
      failed = true;
      throw loadFailedError();
    }

    const decoded = new Map();

    try {
      for (const sample of manifest.samples) {
        if (generation !== capturedGeneration || disposed) {
          throw staleError();
        }

        const response = await fetchImpl(sampleUrl(manifestUrl, sample.file));

        if (
          response?.ok !== true ||
          typeof response?.arrayBuffer !== "function"
        ) {
          throw loadFailedError();
        }

        const bytes = await response.arrayBuffer();

        if (generation !== capturedGeneration || disposed) {
          throw staleError();
        }

        const buffer = await audioContext.decodeAudioData(bytes);

        if (generation !== capturedGeneration || disposed) {
          throw staleError();
        }

        if (buffer === null || buffer === undefined) {
          throw loadFailedError();
        }

        decoded.set(sample.midi, buffer);
      }

      if (generation !== capturedGeneration || disposed) {
        throw staleError();
      }

      buffers.clear();
      for (const [midi, buffer] of decoded) {
        buffers.set(midi, buffer);
      }
    } catch (error) {
      if (
        error?.message === "piano sample load stale" ||
        generation !== capturedGeneration ||
        disposed
      ) {
        throw staleError();
      }

      failed = true;
      buffers.clear();
      throw loadFailedError();
    }
  }

  return Object.freeze({
    initialize() {
      if (configured()) {
        return Promise.resolve(true);
      }

      if (failed || disposed) {
        return Promise.resolve(false);
      }

      if (initializePromise === null) {
        initializePromise = initializeNow().finally(() => {
          initializePromise = null;
        });
      }

      return initializePromise;
    },

    isConfigured() {
      return configured();
    },

    load(audioContext) {
      if (failed || disposed) {
        return Promise.reject(unavailableError());
      }

      if (buffers.size === EXPECTED_SAMPLE_COUNT) {
        return Promise.resolve();
      }

      if (loadPromise === null) {
        const capturedGeneration = generation;
        loadPromise = loadNow(audioContext, capturedGeneration).finally(() => {
          loadPromise = null;
        });
      }

      return loadPromise;
    },

    resolveMidi(midi) {
      if (
        !configured() ||
        buffers.size !== EXPECTED_SAMPLE_COUNT ||
        !Number.isInteger(midi) ||
        midi < 0 ||
        midi > 127
      ) {
        throw unavailableError();
      }

      const pitchClass = ((midi % 12) + 12) % 12;
      const referenceMidi = FIRST_REFERENCE_MIDI + pitchClass;
      const buffer = buffers.get(referenceMidi);

      if (buffer === undefined) {
        throw unavailableError();
      }

      return Object.freeze({
        buffer,
        playbackRate: 2 ** ((midi - referenceMidi) / 12),
        referenceMidi,
      });
    },

    dispose() {
      generation += 1;
      disposed = true;
      initialized = false;
      manifest = null;
      buffers.clear();
    },
  });
}
