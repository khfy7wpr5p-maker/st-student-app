const LOOKAHEAD_MS = 50;
const SCHEDULE_AHEAD_SECONDS = 0.25;
export const MIN_TEMPO_BPM = 20;
export const MAX_TEMPO_BPM = 300;

function validTempo(value) {
  return (
    Number.isFinite(value) &&
    value >= MIN_TEMPO_BPM &&
    value <= MAX_TEMPO_BPM
  );
}

function sortedTempoMap(plan) {
  return Array.isArray(plan?.tempoMap) ? plan.tempoMap : [];
}

function scoreEndBeat(plan) {
  const lastMeasure = plan?.measures?.at?.(-1);
  if (Number.isFinite(lastMeasure?.endBeat)) {
    return lastMeasure.endBeat;
  }

  let end = 0;
  for (const note of plan?.notes ?? []) {
    end = Math.max(end, note.startBeat + note.durationBeats);
  }
  return end;
}

function tempoAtBeat(plan, beat) {
  const map = sortedTempoMap(plan);
  let bpm = plan.referenceTempoBpm;

  for (const entry of map) {
    if (entry.beat > beat) {
      break;
    }
    bpm = entry.bpm;
  }

  return bpm;
}

function beatToSeconds(plan, beat, selectedTempoBpm) {
  const target = Math.max(0, beat);
  const map = sortedTempoMap(plan);
  const scale = plan.referenceTempoBpm / selectedTempoBpm;
  let cursorBeat = 0;
  let bpm = tempoAtBeat(plan, 0);
  let seconds = 0;

  for (const entry of map) {
    if (entry.beat <= 0) {
      bpm = entry.bpm;
      continue;
    }

    if (entry.beat >= target) {
      break;
    }

    seconds +=
      (entry.beat - cursorBeat) *
      (60 / bpm) *
      scale;
    cursorBeat = entry.beat;
    bpm = entry.bpm;
  }

  seconds +=
    (target - cursorBeat) *
    (60 / bpm) *
    scale;

  return seconds;
}

function secondsToBeat(plan, seconds, selectedTempoBpm) {
  if (seconds <= 0) {
    return 0;
  }

  const map = sortedTempoMap(plan);
  const scale = plan.referenceTempoBpm / selectedTempoBpm;
  const endBeat = scoreEndBeat(plan);
  let cursorBeat = 0;
  let cursorSeconds = 0;
  let bpm = tempoAtBeat(plan, 0);

  for (const entry of map) {
    if (entry.beat <= 0) {
      bpm = entry.bpm;
      continue;
    }

    const segmentSeconds =
      (entry.beat - cursorBeat) *
      (60 / bpm) *
      scale;

    if (cursorSeconds + segmentSeconds >= seconds) {
      return Math.min(
        endBeat,
        cursorBeat +
          (seconds - cursorSeconds) /
            ((60 / bpm) * scale),
      );
    }

    cursorSeconds += segmentSeconds;
    cursorBeat = entry.beat;
    bpm = entry.bpm;
  }

  return Math.min(
    endBeat,
    cursorBeat +
      (seconds - cursorSeconds) /
        ((60 / bpm) * scale),
  );
}

function boundedError(message) {
  return new Error(message);
}

export function createWebAudioPianoEngine({
  audioContextFactory,
  audioContextSupported = null,
  sampleBank,
  clock = globalThis,
} = {}) {
  let context = null;
  let masterGain = null;
  let currentPlan = null;
  let selectedTempoBpm = null;
  let playing = false;
  let pausedBeat = 0;
  let anchorBeat = 0;
  let anchorTime = 0;
  let schedulerId = null;
  let scheduled = new Set();
  let repeatMeasureIndex = null;
  let generation = 0;
  const activeSources = new Set();

  function isSupported() {
    const audioBoundaryAvailable =
      audioContextSupported === null
        ? typeof audioContextFactory === "function"
        : audioContextSupported === true;

    return (
      audioBoundaryAvailable &&
      typeof audioContextFactory === "function" &&
      sampleBank?.isConfigured?.() === true
    );
  }

  function ensureContext() {
    if (context !== null) {
      return context;
    }

    const candidate = audioContextFactory?.();

    if (
      candidate === null ||
      typeof candidate !== "object" ||
      typeof candidate.createBufferSource !== "function" ||
      typeof candidate.createGain !== "function"
    ) {
      throw boundedError("audio playback unavailable");
    }

    context = candidate;
    masterGain = context.createGain();
    masterGain.gain.value = 0.16;
    masterGain.connect(context.destination);
    return context;
  }

  function clearScheduler() {
    if (schedulerId !== null) {
      clock.clearInterval?.(schedulerId);
      schedulerId = null;
    }
  }

  function stopSources() {
    for (const source of activeSources) {
      try {
        source.stop(context?.currentTime ?? 0);
      } catch {
        // Already-stopped browser nodes are harmless during teardown.
      }
    }
    activeSources.clear();
    scheduled = new Set();
  }

  function currentBeatSnapshot() {
    if (currentPlan === null) {
      return 0;
    }

    if (!playing || context === null) {
      return pausedBeat;
    }

    const anchorSeconds = beatToSeconds(
      currentPlan,
      anchorBeat,
      selectedTempoBpm,
    );
    const elapsed = Math.max(0, context.currentTime - anchorTime);

    return secondsToBeat(
      currentPlan,
      anchorSeconds + elapsed,
      selectedTempoBpm,
    );
  }

  function repeatMeasure() {
    if (
      currentPlan === null ||
      repeatMeasureIndex === null ||
      !Array.isArray(currentPlan.measures)
    ) {
      return null;
    }

    return currentPlan.measures.find(
      (measure) => measure.index === repeatMeasureIndex,
    ) ?? null;
  }

  function containingMeasureIndex(beat) {
    if (
      currentPlan === null ||
      !Array.isArray(currentPlan.measures) ||
      currentPlan.measures.length === 0
    ) {
      return null;
    }

    for (const measure of currentPlan.measures) {
      if (
        measure.startBeat <= beat &&
        beat < measure.endBeat
      ) {
        return measure.index;
      }
    }

    const last = currentPlan.measures.at(-1);

    if (
      last !== undefined &&
      Math.abs(beat - last.endBeat) <= 1e-9
    ) {
      return last.index;
    }

    return null;
  }

  function reanchor(beat) {
    anchorBeat = beat;
    pausedBeat = beat;
    anchorTime = context.currentTime;
    scheduled = new Set();
  }

  function noteWhen(note) {
    return (
      anchorTime +
      beatToSeconds(currentPlan, note.startBeat, selectedTempoBpm) -
      beatToSeconds(currentPlan, anchorBeat, selectedTempoBpm)
    );
  }

  function noteDurationSeconds(note) {
    return Math.max(
      0.02,
      beatToSeconds(
        currentPlan,
        note.startBeat + note.durationBeats,
        selectedTempoBpm,
      ) -
        beatToSeconds(
          currentPlan,
          note.startBeat,
          selectedTempoBpm,
        ),
    );
  }

  function scheduleNote(note, index, now) {
    const when = Math.max(now, noteWhen(note));
    const duration = noteDurationSeconds(note);
    const end = when + duration;
    const resolved = sampleBank.resolveMidi(note.midi);
    const source = context.createBufferSource();
    const gain = context.createGain();

    source.buffer = resolved.buffer;
    source.playbackRate.value = resolved.playbackRate;
    source.connect(gain);
    gain.connect(masterGain);

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(1, when + 0.005);

    const releaseStart = Math.max(
      when + 0.005,
      end - 0.012,
    );
    gain.gain.setValueAtTime(1, releaseStart);
    gain.gain.linearRampToValueAtTime(0, end);

    source.start(when);
    source.stop(end);
    activeSources.add(source);
    scheduled.add(index);
  }

  function scheduleWindow() {
    if (
      !playing ||
      currentPlan === null ||
      context === null
    ) {
      return;
    }

    const now = context.currentTime;
    const horizon = now + SCHEDULE_AHEAD_SECONDS;
    let beat = currentBeatSnapshot();
    const repeat = repeatMeasure();

    if (repeat !== null && beat >= repeat.endBeat - 1e-9) {
      stopSources();
      reanchor(repeat.startBeat);
      beat = repeat.startBeat;
    }

    for (let index = 0; index < currentPlan.notes.length; index += 1) {
      if (scheduled.has(index)) {
        continue;
      }

      const note = currentPlan.notes[index];
      const noteEnd = note.startBeat + note.durationBeats;

      if (
        repeat !== null &&
        (
          note.startBeat < repeat.startBeat ||
          note.startBeat >= repeat.endBeat
        )
      ) {
        scheduled.add(index);
        continue;
      }

      if (noteEnd <= beat) {
        scheduled.add(index);
        continue;
      }

      if (note.startBeat < beat) {
        // A note already in progress at resume is intentionally omitted.
        // Future onsets still begin at the preserved musical position.
        scheduled.add(index);
        continue;
      }

      const when = noteWhen(note);

      if (when > horizon) {
        continue;
      }

      scheduleNote(note, index, now);
    }
  }

  function ensureScheduler() {
    if (schedulerId === null) {
      schedulerId = clock.setInterval?.(
        scheduleWindow,
        LOOKAHEAD_MS,
      ) ?? null;
    }
  }

  function startAt(beat) {
    anchorBeat = Math.max(0, beat);
    pausedBeat = anchorBeat;
    anchorTime = context.currentTime;
    playing = true;
    scheduled = new Set();
    scheduleWindow();
    ensureScheduler();
  }

  async function resumeContext() {
    if (typeof context?.resume === "function") {
      await context.resume();
    }
  }

  return Object.freeze({
    isSupported,

    async prepare() {
      if (
        typeof sampleBank?.initialize !== "function"
      ) {
        return false;
      }

      try {
        const ready =
          await sampleBank.initialize();
        return ready === true && isSupported();
      } catch {
        return false;
      }
    },

    async play({ plan, tempoBpm } = {}) {
      if (
        plan === null ||
        typeof plan !== "object" ||
        !validTempo(tempoBpm)
      ) {
        throw boundedError("audio playback unavailable");
      }

      const requestGeneration = ++generation;
      const nextContext = ensureContext();
      await resumeContext();

      if (generation !== requestGeneration) {
        return;
      }

      await sampleBank.load(nextContext);

      if (generation !== requestGeneration) {
        return;
      }

      if (currentPlan !== plan) {
        clearScheduler();
        stopSources();
        currentPlan = plan;
        pausedBeat = 0;
        repeatMeasureIndex = null;
      } else if (playing) {
        if (selectedTempoBpm !== tempoBpm) {
          this.setTempo(tempoBpm);
        }
        return;
      }

      selectedTempoBpm = tempoBpm;
      startAt(pausedBeat);
    },

    pause() {
      if (currentPlan === null || context === null) {
        return;
      }

      pausedBeat = currentBeatSnapshot();
      playing = false;
      clearScheduler();
      stopSources();
    },

    async restart() {
      if (currentPlan === null || context === null) {
        throw boundedError("audio playback unavailable");
      }

      await resumeContext();
      clearScheduler();
      stopSources();
      const repeat = repeatMeasure();
      const restartBeat = repeat?.startBeat ?? 0;
      pausedBeat = restartBeat;
      startAt(restartBeat);
    },

    setTempo(bpm) {
      if (!validTempo(bpm) || currentPlan === null) {
        throw new TypeError("tempo out of range");
      }

      if (!playing) {
        selectedTempoBpm = bpm;
        return;
      }

      const beat = currentBeatSnapshot();
      clearScheduler();
      stopSources();
      selectedTempoBpm = bpm;
      pausedBeat = beat;
      startAt(beat);
    },

    setMeasureRepeatEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("repeat enabled must be boolean");
      }

      if (!enabled) {
        if (repeatMeasureIndex === null) {
          return;
        }

        const beat = currentBeatSnapshot();
        repeatMeasureIndex = null;

        if (playing && context !== null) {
          clearScheduler();
          stopSources();
          reanchor(beat);
          scheduleWindow();
          ensureScheduler();
        }

        return;
      }

      if (
        currentPlan === null ||
        !Array.isArray(currentPlan.measures) ||
        currentPlan.measures.length === 0
      ) {
        throw boundedError("measure repeat unavailable");
      }

      if (repeatMeasureIndex !== null) {
        return;
      }

      const beat = currentBeatSnapshot();
      const index = containingMeasureIndex(beat);

      if (index === null) {
        throw boundedError("measure repeat unavailable");
      }

      repeatMeasureIndex = index;

      if (playing && context !== null) {
        clearScheduler();
        stopSources();
        reanchor(beat);
        scheduleWindow();
        ensureScheduler();
      }
    },

    getRepeatMeasureIndex() {
      return repeatMeasureIndex;
    },

    getCurrentBeat() {
      return currentBeatSnapshot();
    },

    dispose() {
      generation += 1;

      if (playing) {
        pausedBeat = currentBeatSnapshot();
      }
      playing = false;
      clearScheduler();
      stopSources();
      currentPlan = null;
      selectedTempoBpm = null;
      repeatMeasureIndex = null;
      pausedBeat = 0;
      anchorBeat = 0;
      anchorTime = 0;
    },
  });
}
