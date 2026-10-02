const VIOLIN_INSTRUMENT = "VIOLIN";
const MAX_EXTERNAL_DURATION_MS = 10_000;

function validIdentity(value, maxLength = 256) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !value.includes("\u0000")
  );
}

function validGeneration(value) {
  return (
    (Number.isSafeInteger(value) && value >= 0) ||
    validIdentity(value, 64)
  );
}

function validPitch(pitch) {
  return Boolean(
    pitch &&
      Number.isInteger(pitch.midi) &&
      pitch.midi >= 0 &&
      pitch.midi <= 127 &&
      (pitch.cents === undefined ||
        (Number.isFinite(pitch.cents) && Math.abs(pitch.cents) <= 100)),
  );
}

function validEvent(event, targetPartId) {
  return Boolean(
    event &&
      validIdentity(event.sourceEventId) &&
      event.partId === targetPartId &&
      Number.isInteger(event.measureIndex) &&
      event.measureIndex >= 0 &&
      Number.isFinite(event.startBeat) &&
      event.startBeat >= 0 &&
      Number.isFinite(event.durationBeats) &&
      event.durationBeats > 0 &&
      Number.isInteger(event.midi) &&
      event.midi >= 0 &&
      event.midi <= 127 &&
      validIdentity(event.voice, 64),
  );
}

function eventKey(value) {
  if (
    !value ||
    !validIdentity(value.partId, 128) ||
    !Number.isInteger(value.measureIndex) ||
    value.measureIndex < 0 ||
    !Number.isFinite(value.startBeat) ||
    value.startBeat < 0 ||
    !Number.isFinite(value.durationBeats) ||
    value.durationBeats <= 0 ||
    !Number.isInteger(value.midi) ||
    value.midi < 0 ||
    value.midi > 127 ||
    !validIdentity(value.voice, 64)
  ) {
    return null;
  }

  return JSON.stringify([
    value.partId,
    value.measureIndex,
    value.startBeat,
    value.durationBeats,
    value.midi,
    value.voice,
  ]);
}

function snapshotSchedule(schedule) {
  if (
    !schedule ||
    !validIdentity(schedule.packageId) ||
    !validIdentity(schedule.sourceId) ||
    schedule.sourceId !== schedule.packageId ||
    !validIdentity(schedule.targetPartId, 128) ||
    !Array.isArray(schedule.pitches) ||
    schedule.pitches.length < 1 ||
    schedule.pitches.length > 128 ||
    !schedule.pitches.every(validPitch) ||
    !Array.isArray(schedule.events) ||
    schedule.events.length < 1
  ) {
    return null;
  }

  const eventsByKey = new Map();
  for (const event of schedule.events) {
    if (!validEvent(event, schedule.targetPartId)) return null;
    const key = eventKey(event);
    if (key === null || eventsByKey.has(key)) return null;
    eventsByKey.set(key, Object.freeze({ ...event }));
  }

  return Object.freeze({
    packageId: schedule.packageId,
    sourceId: schedule.sourceId,
    targetPartId: schedule.targetPartId,
    pitches: Object.freeze(
      schedule.pitches.map((pitch) => Object.freeze({ ...pitch })),
    ),
    eventsByKey,
  });
}

function safeStopAll(engine) {
  try {
    engine?.stopAll?.();
  } catch {
    // External audio teardown is best-effort and never escapes into Student state.
  }
}

function isSuccessfulResult(result) {
  return Boolean(result && result.ok === true);
}

function validEngine(engine) {
  return Boolean(
    engine &&
      typeof engine.setInstrument === "function" &&
      typeof engine.unlockFromUserGesture === "function" &&
      typeof engine.preparePitches === "function" &&
      typeof engine.scheduleNote === "function" &&
      typeof engine.stopAll === "function",
  );
}

export function createViolinAudioLane({
  runtimeLoader,
  audioContextFactory,
} = {}) {
  let disposed = false;
  let epoch = 0;
  let active = null;
  let engine = null;
  let enginePromise = null;

  function isCurrent(candidate) {
    return (
      !disposed &&
      candidate !== null &&
      active === candidate &&
      candidate.epoch === epoch
    );
  }

  function setPianoFallback(candidate) {
    if (!isCurrent(candidate)) return false;
    safeStopAll(engine);
    candidate.mode = "PIANO";
    candidate.externalStarted = false;
    return false;
  }

  function suppressGeneration(candidate) {
    if (!isCurrent(candidate) || candidate.mode === "SUPPRESS") return;
    candidate.mode = "SUPPRESS";
    safeStopAll(engine);
  }

  async function ensureEngine() {
    if (disposed) return null;
    if (engine !== null) return engine;
    if (enginePromise !== null) return enginePromise;
    if (
      typeof runtimeLoader?.load !== "function" ||
      typeof audioContextFactory !== "function"
    ) {
      return null;
    }

    enginePromise = (async () => {
      let created = null;
      try {
        const runtime = await runtimeLoader.load();
        if (disposed || !runtime || typeof runtime.createAudioEngine !== "function") {
          return null;
        }

        created = runtime.createAudioEngine({
          audioContextFactory,
          defaultInstrument: VIOLIN_INSTRUMENT,
        });
        if (!validEngine(created)) {
          safeStopAll(created);
          return null;
        }

        if (disposed) {
          safeStopAll(created);
          return null;
        }
        engine = created;
        return engine;
      } catch {
        safeStopAll(created);
        return null;
      } finally {
        enginePromise = null;
      }
    })();

    return enginePromise;
  }

  async function prepareForPackage({ schedule, generation } = {}) {
    if (disposed || !validGeneration(generation)) return false;

    epoch += 1;
    safeStopAll(engine);

    const preparedSchedule = snapshotSchedule(schedule);
    if (preparedSchedule === null) {
      active = {
        epoch,
        generation,
        packageId: null,
        sourceId: null,
        targetPartId: null,
        pitches: Object.freeze([]),
        eventsByKey: new Map(),
        mode: "PIANO",
        externalStarted: false,
        requestCounter: 0,
      };
      return false;
    }

    const candidate = {
      epoch,
      generation,
      packageId: preparedSchedule.packageId,
      sourceId: preparedSchedule.sourceId,
      targetPartId: preparedSchedule.targetPartId,
      pitches: preparedSchedule.pitches,
      eventsByKey: preparedSchedule.eventsByKey,
      mode: "PREPARING",
      externalStarted: false,
      requestCounter: 0,
    };
    active = candidate;

    try {
      const reusableEngine = await ensureEngine();
      if (!isCurrent(candidate)) return false;
      if (reusableEngine === null) return setPianoFallback(candidate);

      await reusableEngine.setInstrument(VIOLIN_INSTRUMENT);
      if (!isCurrent(candidate)) return false;

      const unlockResult = await reusableEngine.unlockFromUserGesture();
      if (!isCurrent(candidate)) return false;
      if (!isSuccessfulResult(unlockResult)) {
        return setPianoFallback(candidate);
      }

      const prepareResult = await reusableEngine.preparePitches({
        instrumentId: VIOLIN_INSTRUMENT,
        pitches: candidate.pitches,
      });
      if (!isCurrent(candidate)) return false;
      if (!isSuccessfulResult(prepareResult)) {
        return setPianoFallback(candidate);
      }

      candidate.mode = "READY";
      return true;
    } catch {
      return setPianoFallback(candidate);
    }
  }

  function degradeCurrentRoute(candidate) {
    if (!isCurrent(candidate)) return "SUPPRESS";

    if (candidate.externalStarted) {
      suppressGeneration(candidate);
      return "SUPPRESS";
    }

    setPianoFallback(candidate);
    return "PIANO";
  }

  function routeNote({
    note,
    startTimeSeconds,
    durationSeconds,
    generation,
  } = {}) {
    if (disposed) return "SUPPRESS";
    if (active === null) return "PIANO";
    if (!Object.is(generation, active.generation)) return "SUPPRESS";

    if (active.mode === "PIANO") return "PIANO";
    if (note?.partId !== active.targetPartId) return "PIANO";
    if (active.mode === "SUPPRESS") return "SUPPRESS";
    if (active.mode !== "READY") return "PIANO";

    const key = eventKey(note);
    const event = key === null ? null : active.eventsByKey.get(key) ?? null;
    const durationMs = durationSeconds * 1000;
    if (
      event === null ||
      !Number.isFinite(startTimeSeconds) ||
      startTimeSeconds < 0 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      !Number.isFinite(durationMs) ||
      durationMs > MAX_EXTERNAL_DURATION_MS
    ) {
      return degradeCurrentRoute(active);
    }

    const candidate = active;
    if (engine === null || typeof engine.scheduleNote !== "function") {
      return degradeCurrentRoute(candidate);
    }

    candidate.requestCounter += 1;
    const requestId = `violin:${String(candidate.generation)}:${candidate.requestCounter}`;
    const request = Object.freeze({
      requestId,
      sourceRevisionId: candidate.sourceId,
      sourceEventId: event.sourceEventId,
      instrumentId: VIOLIN_INSTRUMENT,
      pitch: Object.freeze({ midi: event.midi }),
      startTimeSeconds,
      durationMs,
    });

    candidate.externalStarted = true;
    try {
      Promise.resolve(engine.scheduleNote(request))
        .then((result) => {
          if (!isCurrent(candidate)) return;
          if (!isSuccessfulResult(result)) suppressGeneration(candidate);
        })
        .catch(() => {
          suppressGeneration(candidate);
        });
    } catch {
      suppressGeneration(candidate);
    }

    return "EXTERNAL";
  }

  function stopAll() {
    safeStopAll(engine);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    epoch += 1;
    safeStopAll(engine);
    active = null;
    // Do not call Audio Engine dispose(): Student owns the shared AudioContext.
  }

  return Object.freeze({
    prepareForPackage,
    routeNote,
    stopAll,
    dispose,
  });
}
