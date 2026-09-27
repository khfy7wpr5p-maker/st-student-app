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
  const contextCache = new Map();
  const selectedTempo = new Map();
  const repeatEnabled = new Map();
  const positionSubscriptions = new Map();
  let activePackageId = null;

  function validPlanForPackage(plan, packageId) {
    return (
      plan !== null &&
      typeof plan === "object" &&
      plan.packageId === packageId &&
      PLAYBACK_QUALITIES.has(plan.quality) &&
      tempoInRange(plan.referenceTempoBpm)
    );
  }

  function resolveContext(pkg) {
    const packageId = packageIdOf(pkg);

    if (packageId === null) {
      return null;
    }

    if (contextCache.has(packageId)) {
      return contextCache.get(packageId);
    }

    let context = null;

    try {
      if (
        typeof playbackPlanResolver?.resolvePackageContext === "function"
      ) {
        const resolved =
          playbackPlanResolver.resolvePackageContext(pkg);
        if (
          resolved !== null &&
          typeof resolved === "object" &&
          validPlanForPackage(resolved.plan, packageId)
        ) {
          context = Object.freeze({
            plan: resolved.plan,
            timingProvenance:
              resolved.timingProvenance ?? null,
          });
        }
      } else if (
        typeof playbackPlanResolver?.resolvePackage === "function"
      ) {
        const plan = playbackPlanResolver.resolvePackage(pkg);
        if (validPlanForPackage(plan, packageId)) {
          context = Object.freeze({
            plan,
            timingProvenance: null,
          });
        }
      }
    } catch {
      context = null;
    }

    contextCache.set(packageId, context);
    return context;
  }

  function resolve(pkg) {
    return resolveContext(pkg)?.plan ?? null;
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

  function releaseEngineOwnershipFor(packageId) {
    if (
      activePackageId === null ||
      activePackageId === packageId
    ) {
      return;
    }

    try {
      engine?.dispose?.();
    } catch {
      // Old audio ownership must not block the new package.
    }
    activePackageId = null;
  }

  function disposePositionSubscriptions(packageId) {
    const subscriptions =
      positionSubscriptions.get(packageId);
    if (subscriptions === undefined) {
      return;
    }

    positionSubscriptions.delete(packageId);
    for (const subscription of subscriptions) {
      subscription.active = false;
      try {
        subscription.unsubscribeEngine();
      } catch {
        // Subscription teardown is best-effort.
      }
    }
  }

  function validMeasureRange(plan, startBeat, endBeat) {
    if (
      !Number.isFinite(startBeat) ||
      !Number.isFinite(endBeat) ||
      endBeat <= startBeat ||
      !Array.isArray(plan?.measures)
    ) {
      return false;
    }

    return plan.measures.some(
      (measure) =>
        measure?.startBeat === startBeat &&
        measure?.endBeat === endBeat,
    );
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

    async preparePackage(pkg) {
      if (
        resolve(pkg) === null ||
        typeof engine?.prepare !== "function"
      ) {
        return false;
      }

      try {
        const prepared =
          await engine.prepare();
        return (
          prepared === true &&
          playablePlan(pkg) !== null
        );
      } catch {
        return false;
      }
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

    getScoreFollowPlaybackContextForPackage(pkg) {
      return resolveContext(pkg);
    },

    async playMeasureOnceForPackage(
      pkg,
      { startBeat, endBeat } = {},
    ) {
      const plan = requirePlayable(pkg);
      const packageId = plan.packageId;

      if (!validMeasureRange(plan, startBeat, endBeat)) {
        throw bounded("playback operation failed");
      }

      releaseEngineOwnershipFor(packageId);

      const tempo =
        selectedTempo.get(packageId) ??
        plan.referenceTempoBpm;

      activePackageId = packageId;

      try {
        await engine.playRange({
          plan,
          tempoBpm: tempo,
          startBeat,
          endBeat,
        });
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

    subscribePositionForPackage(pkg, listener) {
      const plan = requirePlayable(pkg);
      if (typeof listener !== "function") {
        throw new TypeError("position listener required");
      }

      const packageId = plan.packageId;
      const subscription = {
        active: true,
        unsubscribeEngine: () => {},
      };

      try {
        subscription.unsubscribeEngine =
          engine.subscribePosition((snapshot) => {
            if (
              subscription.active &&
              activePackageId === packageId
            ) {
              listener(snapshot);
            }
          });
      } catch {
        subscription.active = false;
        throw bounded("playback operation failed");
      }

      if (
        typeof subscription.unsubscribeEngine !==
        "function"
      ) {
        subscription.active = false;
        throw bounded("playback operation failed");
      }

      const subscriptions =
        positionSubscriptions.get(packageId) ??
        new Set();
      subscriptions.add(subscription);
      positionSubscriptions.set(
        packageId,
        subscriptions,
      );

      return () => {
        if (!subscription.active) {
          return;
        }
        subscription.active = false;
        subscriptions.delete(subscription);
        if (subscriptions.size === 0) {
          positionSubscriptions.delete(packageId);
        }
        try {
          subscription.unsubscribeEngine();
        } catch {
          // Subscription teardown is best-effort.
        }
      };
    },

    async playPackage(pkg) {
      const plan = requirePlayable(pkg);
      const packageId = plan.packageId;

      releaseEngineOwnershipFor(packageId);

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

      if (activePackageId === packageId) {
        const result = wrapFailure(
          "tempo operation failed",
          () => engine.setTempo(bpm),
        );

        if (result !== null && typeof result?.then === "function") {
          return Promise.resolve(result).then(() => {
            if (activePackageId === packageId) {
              selectedTempo.set(packageId, bpm);
            }
          });
        }

        selectedTempo.set(packageId, bpm);
        return result;
      }

      selectedTempo.set(packageId, bpm);
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

      if (activePackageId === packageId) {
        const result = wrapFailure(
          "measure repeat operation failed",
          () => engine.setMeasureRepeatEnabled(enabled),
        );

        if (result !== null && typeof result?.then === "function") {
          return Promise.resolve(result).then(() => {
            if (activePackageId === packageId) {
              repeatEnabled.set(packageId, enabled);
            }
          });
        }

        repeatEnabled.set(packageId, enabled);
        return result;
      }

      repeatEnabled.set(packageId, enabled);
      return undefined;
    },

    disposePackage(pkg) {
      const packageId = packageIdOf(pkg);

      if (packageId === null) {
        return;
      }

      selectedTempo.delete(packageId);
      repeatEnabled.delete(packageId);
      contextCache.delete(packageId);
      disposePositionSubscriptions(packageId);

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
