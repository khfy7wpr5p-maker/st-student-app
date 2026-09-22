const MIN_TEMPO_BPM = 20;
const MAX_TEMPO_BPM = 300;
const PLAYBACK_QUALITIES = new Set(["FULL", "APPROXIMATE"]);

function packageIdOf(pkg) {
  return (
    typeof pkg?.packageId === "string" &&
    pkg.packageId.length > 0
      ? pkg.packageId
      : null
  );
}

function tempoInRange(value) {
  return (
    Number.isFinite(value) &&
    value >= MIN_TEMPO_BPM &&
    value <= MAX_TEMPO_BPM
  );
}

function bounded(message) {
  return new Error(message);
}

export function createStudentPlaybackPort({
  playbackPlanResolver,
  engine,
} = {}) {
  const planCache = new Map();
  const selectedTempo = new Map();
  const repeatEnabled = new Map();
  let activePackageId = null;

  function resolve(pkg) {
    const packageId = packageIdOf(pkg);

    if (
      packageId === null ||
      typeof playbackPlanResolver?.resolvePackage !== "function"
    ) {
      return null;
    }

    if (planCache.has(packageId)) {
      return planCache.get(packageId);
    }

    let plan = null;

    try {
      plan = playbackPlanResolver.resolvePackage(pkg);
    } catch {
      plan = null;
    }

    if (
      plan === null ||
      typeof plan !== "object" ||
      plan.packageId !== packageId ||
      !PLAYBACK_QUALITIES.has(plan.quality) ||
      !tempoInRange(plan.referenceTempoBpm)
    ) {
      plan = null;
    }

    planCache.set(packageId, plan);
    return plan;
  }

  function engineSupported() {
    try {
      return engine?.isSupported?.() === true;
    } catch {
      return false;
    }
  }

  function playablePlan(pkg) {
    const plan = resolve(pkg);
    return plan !== null && engineSupported() ? plan : null;
  }

  function requirePlayable(pkg) {
    const plan = playablePlan(pkg);

    if (plan === null) {
      throw bounded("playback unavailable");
    }

    return plan;
  }

  function requireActive(pkg) {
    const packageId = packageIdOf(pkg);

    if (
      packageId === null ||
      activePackageId !== packageId
    ) {
      throw bounded("playback package inactive");
    }

    return packageId;
  }

  function wrapFailure(message, operation) {
    try {
      const result = operation();

      if (result !== null && typeof result?.then === "function") {
        return Promise.resolve(result).catch(() => {
          throw bounded(message);
        });
      }

      return result;
    } catch {
      throw bounded(message);
    }
  }

  const port = {
    canPlayPackage(pkg) {
      return playablePlan(pkg) !== null;
    },

    canChangeTempoForPackage(pkg) {
      return (
        pkg?.practice?.allowTempoChange === true &&
        playablePlan(pkg) !== null
      );
    },

    canRepeatMeasureForPackage(pkg) {
      const plan = playablePlan(pkg);
      return (
        pkg?.practice?.allowMeasureRepeat === true &&
        plan !== null &&
        Array.isArray(plan.measures) &&
        plan.measures.length > 0
      );
    },

    getPlaybackQualityForPackage(pkg) {
      const plan = resolve(pkg);
      return PLAYBACK_QUALITIES.has(plan?.quality)
        ? plan.quality
        : null;
    },

    getReferenceTempoForPackage(pkg) {
      const plan = resolve(pkg);
      return tempoInRange(plan?.referenceTempoBpm)
        ? plan.referenceTempoBpm
        : null;
    },

    async playPackage(pkg) {
      const plan = requirePlayable(pkg);
      const packageId = plan.packageId;

      if (
        activePackageId !== null &&
        activePackageId !== packageId
      ) {
        try {
          engine?.dispose?.();
        } catch {
          // Old audio ownership must not block the new package.
        }
        activePackageId = null;
      }

      const tempo =
        selectedTempo.get(packageId) ?? plan.referenceTempoBpm;

      activePackageId = packageId;

      try {
        await engine.play({ plan, tempoBpm: tempo });

        if (repeatEnabled.get(packageId) === true) {
          engine.setMeasureRepeatEnabled(true);
        }
      } catch {
        if (activePackageId === packageId) {
          try {
            engine?.dispose?.();
          } catch {
            // Failure cleanup remains bounded.
          }
          activePackageId = null;
        }
        throw bounded("playback operation failed");
      }
    },

    pausePackage(pkg) {
      requireActive(pkg);
      return wrapFailure(
        "playback operation failed",
        () => engine.pause(),
      );
    },

    restartPackage(pkg) {
      requireActive(pkg);
      return wrapFailure(
        "playback operation failed",
        () => engine.restart(),
      );
    },

    setTempoForPackage(pkg, bpm) {
      if (!tempoInRange(bpm)) {
        throw new TypeError("tempo out of range");
      }

      if (pkg?.practice?.allowTempoChange !== true) {
        throw bounded("tempo change unavailable");
      }

      const plan = requirePlayable(pkg);
      const packageId = plan.packageId;
      selectedTempo.set(packageId, bpm);

      if (activePackageId === packageId) {
        return wrapFailure(
          "tempo operation failed",
          () => engine.setTempo(bpm),
        );
      }

      return undefined;
    },

    setMeasureRepeatEnabledForPackage(pkg, enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("repeat enabled must be boolean");
      }

      if (pkg?.practice?.allowMeasureRepeat !== true) {
        throw bounded("measure repeat unavailable");
      }

      const plan = requirePlayable(pkg);

      if (!Array.isArray(plan.measures) || plan.measures.length === 0) {
        throw bounded("measure repeat unavailable");
      }

      const packageId = plan.packageId;
      repeatEnabled.set(packageId, enabled);

      if (activePackageId === packageId) {
        return wrapFailure(
          "measure repeat operation failed",
          () => engine.setMeasureRepeatEnabled(enabled),
        );
      }

      return undefined;
    },

    disposePackage(pkg) {
      const packageId = packageIdOf(pkg);

      if (packageId === null) {
        return;
      }

      selectedTempo.delete(packageId);
      repeatEnabled.delete(packageId);

      if (activePackageId !== packageId) {
        return;
      }

      activePackageId = null;

      try {
        engine?.dispose?.();
      } catch {
        // Playback teardown is best-effort at authority boundaries.
      }
    },
  };

  return Object.freeze(port);
}
