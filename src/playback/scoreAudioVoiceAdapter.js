const RUNTIME_VERSION = "0.2.0";
const INSTRUMENTS = new Set([
  "GRAND_PIANO",
  "CLASSICAL_GUITAR",
  "VIOLIN",
]);

function unavailable() {
  return new Error("audio playback unavailable");
}

export function createScoreAudioVoiceAdapter({
  runtime,
  audioContextFactory,
  fetchImpl = globalThis.fetch,
} = {}) {
  const engines = new Map();
  let sampleProvider = null;
  let generation = 0;

  function runtimeReady() {
    return (
      runtime?.version === RUNTIME_VERSION &&
      typeof runtime?.createAudioEngine === "function" &&
      typeof audioContextFactory === "function"
    );
  }

  function getEngine(instrumentId) {
    if (!runtimeReady()) throw unavailable();
    if (engines.has(instrumentId)) return engines.get(instrumentId);
    const options = {
      audioContextFactory,
      audioContextOwnership: "external",
      defaultInstrument: instrumentId,
    };
    const manifests = [
      runtime?.SALAMANDER_GRAND_PIANO_MANIFEST,
      runtime?.FREEPATS_CLASSICAL_GUITAR_MANIFEST,
      runtime?.VSCO2CE_SOLO_VIOLIN_ARCO_VIB_MANIFEST,
    ];
    if (
      typeof runtime?.ManifestSampleProvider === "function" &&
      manifests.every((manifest) => manifest !== undefined) &&
      typeof fetchImpl === "function"
    ) {
      sampleProvider ??= new runtime.ManifestSampleProvider(
        manifests,
        {
          fetcher: (url) => fetchImpl(url.replace(/#/g, "%23")),
        },
      );
      options.sampleProvider = sampleProvider;
    }
    const engine = runtime.createAudioEngine(options);
    engines.set(instrumentId, engine);
    return engine;
  }

  return Object.freeze({
    isSupported(instrumentId) {
      return runtimeReady() && INSTRUMENTS.has(instrumentId);
    },

    async prepare({ instrumentId, pitches } = {}) {
      if (
        !INSTRUMENTS.has(instrumentId) ||
        !Array.isArray(pitches)
      ) {
        throw unavailable();
      }

      const target = getEngine(instrumentId);
      await target.setInstrument(instrumentId);
      await target.prepare();
      const unlocked = await target.unlockFromUserGesture();
      if (unlocked?.ok !== true) throw unavailable();

      const unique = [...new Set(pitches)]
        .filter((midi) => Number.isInteger(midi) && midi >= 0 && midi <= 127)
        .map((midi) => Object.freeze({ midi }));
      const prepared = await target.preparePitches({
        instrumentId,
        pitches: unique,
      });
      if (prepared?.ok !== true) throw unavailable();
      return true;
    },

    scheduleNote({
      requestId,
      sourceRevisionId,
      instrumentId,
      midi,
      startTimeSeconds,
      durationSeconds,
    } = {}) {
      const engine = engines.get(instrumentId);
      if (engine === undefined) {
        throw unavailable();
      }
      const durationMs = Math.max(
        20,
        Math.min(10_000, Math.round(durationSeconds * 1000)),
      );
      const requestGeneration = generation;
      void engine.scheduleNote({
        requestId,
        sourceRevisionId,
        instrumentId,
        pitch: Object.freeze({ midi }),
        startTimeSeconds,
        durationMs,
      }).then((result) => {
        if (requestGeneration !== generation) {
          engine.noteOff?.(requestId);
          return;
        }
        if (result?.ok !== true) engine?.stopAll?.();
      }).catch(() => {
        if (requestGeneration === generation) engine.stopAll?.();
      });
    },

    stopAll() {
      generation += 1;
      for (const engine of engines.values()) engine.stopAll?.();
    },
  });
}
