import { AUDIO_CALIBRATION, AUDIO_MASTER_GAIN } from './audioCalibration.js';
const RUNTIME_VERSION = '0.3.0';
const INSTRUMENTS = new Set(['GRAND_PIANO', 'CLASSICAL_GUITAR', 'VIOLIN']);
const unavailable = () => new Error('audio playback unavailable');

export function createScoreAudioVoiceAdapter({runtime, audioContextFactory, fetchImpl = globalThis.fetch} = {}) {
  const engines = new Map();
  const legacyEngines = new Map();
  const preparedEngines = new Map();
  let sampleProvider = null;
  let legacyProvider = null;
  let outputNode = null;
  let generation = 0;

  function manifests() {
    return [runtime?.SALAMANDER_GRAND_PIANO_MANIFEST, runtime?.FREEPATS_CLASSICAL_GUITAR_MANIFEST, runtime?.VSCO2CE_SOLO_VIOLIN_ARCO_VIB_MANIFEST];
  }
  function runtimeReady() {
    return runtime?.version === RUNTIME_VERSION && typeof runtime.createAudioEngine === 'function' &&
      typeof runtime.ManifestSampleProvider === 'function' && typeof audioContextFactory === 'function' &&
      typeof fetchImpl === 'function' && manifests().every(m => m && Array.isArray(m.samples) && m.samples.length > 0);
  }
  function sharedOutput() {
    if (outputNode !== null) return outputNode;
    const context = audioContextFactory();
    const candidate = context.createGain();
    const protection = context.createDynamicsCompressor();
    candidate.gain.value = AUDIO_MASTER_GAIN;
    protection.threshold.value = -14;
    protection.knee.value = 0;
    protection.ratio.value = 20;
    protection.attack.value = 0;
    protection.release.value = 0.15;
    candidate.connect(protection);
    protection.connect(context.destination);
    outputNode = candidate;
    return outputNode;
  }
  function getEngine(instrumentId, legacy = false) {
    if (!runtimeReady()) throw unavailable();
    const map = legacy ? legacyEngines : engines;
    if (map.has(instrumentId)) return map.get(instrumentId);
    const bankManifests = manifests().map(m => !legacy && m.instrumentId === 'VIOLIN' ? {
      ...m,
      id: 'vsco2ce-solo-violin-arco-vib-f-v1',
      samples: m.samples.map(s => ({...s, path: s.path.replace(/_p\.wav$/, '_f.wav')})),
    } : m);
    const makeProvider = () => new runtime.ManifestSampleProvider(bankManifests, {fetcher: url => fetchImpl(url.replace(/#/g, '%23'))});
    const provider = legacy ? (legacyProvider ??= makeProvider()) : (sampleProvider ??= makeProvider());
    const engine = runtime.createAudioEngine({
      audioContextFactory,
      audioContextOwnership: 'external',
      defaultInstrument: instrumentId,
      sampleProvider: provider,
      // Old p-only offline caches keep their original, uncalibrated audio route.
      ...(legacy ? {} : {calibrationProfile: AUDIO_CALIBRATION[instrumentId], outputNode: sharedOutput()}),
    });
    map.set(instrumentId, engine);
    return engine;
  }
  async function prepareTarget(target, instrumentId, pitches) {
    await target.setInstrument(instrumentId);
    await target.prepare();
    if ((await target.unlockFromUserGesture())?.ok !== true) throw unavailable();
    return target.preparePitches({instrumentId, pitches});
  }
  return Object.freeze({
    isSupported(instrumentId) { return runtimeReady() && INSTRUMENTS.has(instrumentId); },
    async prepare({instrumentId, pitches} = {}) {
      if (!INSTRUMENTS.has(instrumentId) || !Array.isArray(pitches)) throw unavailable();
      const requestGeneration = generation;
      const unique = [...new Set(pitches)].filter(midi => Number.isInteger(midi) && midi >= 0 && midi <= 127).map(midi => Object.freeze({midi}));
      let target = getEngine(instrumentId);
      let result = await prepareTarget(target, instrumentId, unique);
      if (result?.ok !== true && result?.error?.code === 'SAMPLE_UNAVAILABLE' && instrumentId === 'VIOLIN') {
        target = getEngine(instrumentId, true);
        result = await prepareTarget(target, instrumentId, unique);
      }
      if (result?.ok !== true || requestGeneration !== generation) throw unavailable();
      // Atomic bank selection after every requested pitch has decoded; no mixed p/f lane.
      preparedEngines.set(instrumentId, target);
      return true;
    },
    scheduleNote({requestId, sourceRevisionId, instrumentId, midi, startTimeSeconds, durationSeconds, velocity} = {}) {
      const engine = preparedEngines.get(instrumentId);
      if (engine === undefined) throw unavailable();
      const durationMs = Math.max(20, Math.min(10_000, Math.round(durationSeconds * 1000)));
      const requestGeneration = generation;
      void engine.scheduleNote({requestId, sourceRevisionId, instrumentId, pitch: Object.freeze({midi}), startTimeSeconds, durationMs,
        ...(velocity === undefined ? {} : {velocity}),
      }).then(result => {
        if (requestGeneration !== generation) { engine.noteOff?.(requestId); return; }
        if (result?.ok !== true) engine.stopAll?.();
      }).catch(() => { if (requestGeneration === generation) engine.stopAll?.(); });
    },
    stopAll() {
      generation += 1;
      for (const engine of new Set([...engines.values(), ...legacyEngines.values()])) engine.stopAll?.();
    },
  });
}
