import {
  resolveViolinFollowSnapshot,
  VIOLIN_FOLLOW_STATES,
} from "../../vendor/st-violin-learning/src/index.js";
import { createScoreFollowIndex } from "./scoreFollowIndex.js";

function validIdentity(value, maxLength = 256) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !value.includes("\u0000")
  );
}

function packageIdOf(pkg) {
  return validIdentity(pkg?.packageId) ? pkg.packageId : null;
}

export function createViolinFollowCoordinator({
  playbackPort,
  presentationPort,
  createIndex = createScoreFollowIndex,
  resolveSnapshot = resolveViolinFollowSnapshot,
} = {}) {
  let binding = null;
  let generation = 0;
  let unsubscribePosition = null;

  function nextGeneration() {
    generation =
      generation >= Number.MAX_SAFE_INTEGER
        ? 1
        : generation + 1;
    return generation;
  }

  function current(expectedGeneration) {
    return binding !== null && generation === expectedGeneration;
  }

  function unsubscribeCurrent() {
    const unsubscribe = unsubscribePosition;
    unsubscribePosition = null;
    if (typeof unsubscribe !== "function") return;
    try {
      unsubscribe();
    } catch {
      // Violin follow subscription teardown is best-effort.
    }
  }

  async function clearPresentation(expectedGeneration = null) {
    if (
      expectedGeneration !== null &&
      !current(expectedGeneration)
    ) {
      return;
    }
    try {
      await presentationPort?.clear?.();
    } catch {
      // Violin presentation is independently degradable.
    }
  }

  function clearPresentationBestEffort() {
    try {
      const result = presentationPort?.clear?.();
      if (result !== null && typeof result?.then === "function") {
        void Promise.resolve(result).catch(() => {});
      }
    } catch {
      // Violin presentation cleanup cannot affect playback.
    }
  }

  function invalidate({ clearPresentation: shouldClear = true } = {}) {
    const hadBinding = binding !== null;
    nextGeneration();
    unsubscribeCurrent();
    binding = null;
    if (shouldClear && hadBinding) {
      clearPresentationBestEffort();
    }
  }

  async function updatePosition(snapshot, expectedGeneration) {
    const active = binding;
    if (
      active === null ||
      generation !== expectedGeneration ||
      snapshot === null ||
      typeof snapshot !== "object" ||
      !Number.isFinite(snapshot.beat)
    ) {
      return;
    }

    let beatResult;
    try {
      beatResult = active.index.resolveBeat(snapshot.beat);
    } catch {
      await clearPresentation(expectedGeneration);
      return;
    }

    if (!current(expectedGeneration)) return;

    if (
      beatResult === null ||
      active.index.eventMapping !== "EXACT" ||
      !Array.isArray(beatResult.activeEvents)
    ) {
      await clearPresentation(expectedGeneration);
      return;
    }

    let resolved;
    try {
      resolved = resolveSnapshot({
        binding: {
          packageId: active.packageId,
          sourceId: active.sourceId,
          generation: expectedGeneration,
          targetPartId: active.targetPartId,
          ...(active.stringLengthMm === undefined
            ? {}
            : { stringLengthMm: active.stringLengthMm }),
        },
        snapshot: {
          packageId: active.packageId,
          sourceId: active.sourceId,
          generation: expectedGeneration,
          playing: snapshot.playing === true,
          activeEvents: beatResult.activeEvents,
        },
      });
    } catch {
      await clearPresentation(expectedGeneration);
      return;
    }

    if (!current(expectedGeneration)) return;

    if (resolved?.state !== VIOLIN_FOLLOW_STATES.AVAILABLE) {
      await clearPresentation(expectedGeneration);
      return;
    }

    const sourceEvent = beatResult.activeEvents.find(
      (event) =>
        event?.eventId === resolved.eventId &&
        event?.partId === active.targetPartId,
    );
    if (
      sourceEvent === undefined ||
      sourceEvent.pitch === null ||
      typeof sourceEvent.pitch !== "object"
    ) {
      await clearPresentation(expectedGeneration);
      return;
    }

    const presentationSnapshot = Object.freeze({
      ...resolved,
      pitch: sourceEvent.pitch,
    });

    try {
      await presentationPort?.show?.(presentationSnapshot);
    } catch {
      // Presentation failure must not affect playback.
    }
  }

  const coordinator = {
    bind({
      pkg,
      sourceId,
      musicXml,
      targetPartId,
      stringLengthMm,
    } = {}) {
      invalidate();

      const packageId = packageIdOf(pkg);
      if (
        packageId === null ||
        sourceId !== packageId ||
        !validIdentity(sourceId) ||
        typeof musicXml !== "string" ||
        musicXml.length === 0 ||
        !validIdentity(targetPartId, 128) ||
        (stringLengthMm !== undefined &&
          (!Number.isFinite(stringLengthMm) || stringLengthMm <= 0)) ||
        typeof createIndex !== "function" ||
        typeof resolveSnapshot !== "function" ||
        typeof playbackPort?.getScoreFollowPlaybackContextForPackage !==
          "function" ||
        typeof playbackPort?.subscribePositionForPackage !== "function"
      ) {
        return false;
      }

      let playbackContext;
      let index;
      try {
        playbackContext =
          playbackPort.getScoreFollowPlaybackContextForPackage(pkg);
        if (
          playbackContext === null ||
          typeof playbackContext !== "object"
        ) {
          return false;
        }
        index = createIndex({
          packageId,
          sourceId,
          musicXml,
          playbackContext,
        });
      } catch {
        return false;
      }

      if (
        index === null ||
        typeof index !== "object" ||
        index.measureMapping !== "EXACT" ||
        index.eventMapping !== "EXACT" ||
        typeof index.resolveBeat !== "function"
      ) {
        return false;
      }

      const bindGeneration = generation;
      binding = Object.freeze({
        pkg,
        packageId,
        sourceId,
        targetPartId,
        stringLengthMm,
        index,
      });

      try {
        unsubscribePosition =
          playbackPort.subscribePositionForPackage(
            pkg,
            (snapshot) => {
              if (!current(bindGeneration)) return;
              void updatePosition(snapshot, bindGeneration).catch(() => {});
            },
          );
      } catch {
        binding = null;
        unsubscribePosition = null;
        nextGeneration();
        return false;
      }

      if (typeof unsubscribePosition !== "function") {
        binding = null;
        unsubscribePosition = null;
        nextGeneration();
        return false;
      }

      return true;
    },

    async clear() {
      const hadBinding = binding !== null;
      nextGeneration();
      unsubscribeCurrent();
      binding = null;
      if (hadBinding) {
        try {
          await presentationPort?.clear?.();
        } catch {
          // Presentation cleanup remains best-effort.
        }
      }
    },

    async dispose() {
      await coordinator.clear();
    },
  };

  return Object.freeze(coordinator);
}