import { createScoreFollowIndex } from "./scoreFollowIndex.js";

const MAX_RENDER_EPOCH_LENGTH = 128;

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

function validEvidence(evidence, sourceId) {
  return (
    evidence !== null &&
    typeof evidence === "object" &&
    evidence.sourceId === sourceId &&
    validIdentity(
      evidence.renderEpoch,
      MAX_RENDER_EPOCH_LENGTH,
    )
  );
}

function refKey(ref) {
  if (ref === null || typeof ref !== "object") {
    return null;
  }

  const { partId, measureIndex, noteIndex, voice } = ref;
  if (
    !validIdentity(partId, 128) ||
    !Number.isSafeInteger(measureIndex) ||
    measureIndex < 0 ||
    !Number.isSafeInteger(noteIndex) ||
    noteIndex < 0
  ) {
    return null;
  }

  const normalizedVoice =
    voice === undefined
      ? null
      : Number.isSafeInteger(voice) && voice >= 0
        ? voice
        : null;
  if (voice !== undefined && normalizedVoice === null) {
    return null;
  }

  return [
    partId,
    String(measureIndex),
    String(noteIndex),
    normalizedVoice === null ? "" : String(normalizedVoice),
  ].join("\u001f");
}

function sortedHighlightSet(refs) {
  if (!Array.isArray(refs)) {
    return null;
  }

  const keyed = [];
  for (const ref of refs) {
    const key = refKey(ref);
    if (key === null) return null;
    keyed.push({ key, ref });
  }

  keyed.sort((left, right) =>
    left.key.localeCompare(right.key),
  );

  return Object.freeze({
    key: keyed.map((item) => item.key).join("\u001e"),
    refs: Object.freeze(keyed.map((item) => item.ref)),
  });
}

export function createScoreFollowCoordinator({
  notationAdapter,
  playbackPort,
  createIndex = createScoreFollowIndex,
} = {}) {
  let binding = null;
  let generation = 0;
  let unsubscribePosition = null;
  let lastCursorKey = null;
  let lastHighlightKey = null;

  function nextGeneration() {
    generation =
      generation >= Number.MAX_SAFE_INTEGER
        ? 1
        : generation + 1;
    return generation;
  }

  function current(expectedGeneration) {
    return (
      binding !== null &&
      generation === expectedGeneration
    );
  }

  function unsubscribeCurrent() {
    const unsubscribe = unsubscribePosition;
    unsubscribePosition = null;
    if (typeof unsubscribe !== "function") return;

    try {
      unsubscribe();
    } catch {
      // Follow subscription teardown is best-effort.
    }
  }

  function clearPresentationBestEffort() {
    try {
      const result = notationAdapter?.clearHighlights?.();
      if (result !== null && typeof result?.then === "function") {
        void Promise.resolve(result).catch(() => {});
      }
    } catch {
      // Renderer presentation cleanup must stay bounded.
    }
  }

  function invalidate({ clearPresentation = true } = {}) {
    const hadBinding = binding !== null;
    nextGeneration();
    unsubscribeCurrent();
    binding = null;
    lastCursorKey = null;
    lastHighlightKey = null;

    if (clearPresentation && hadBinding) {
      clearPresentationBestEffort();
    }
  }

  async function updatePosition(
    snapshot,
    expectedGeneration,
  ) {
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

    let resolved;
    try {
      resolved = active.index.resolveBeat(snapshot.beat);
    } catch {
      return;
    }

    if (!current(expectedGeneration)) return;

    if (resolved === null) {
      if (lastHighlightKey !== null) {
        try {
          await notationAdapter?.clearHighlights?.();
        } catch {
          return;
        }
        if (current(expectedGeneration)) {
          lastHighlightKey = "";
        }
      }
      return;
    }

    const cursorTarget = resolved.cursorTarget;
    if (
      cursorTarget !== null &&
      typeof cursorTarget === "object" &&
      validIdentity(cursorTarget.partId, 128) &&
      Number.isSafeInteger(cursorTarget.measureIndex) &&
      cursorTarget.measureIndex >= 0
    ) {
      const cursorKey =
        cursorTarget.partId +
        "\u001f" +
        String(cursorTarget.measureIndex);
      if (cursorKey !== lastCursorKey) {
        lastCursorKey = cursorKey;
        try {
          await notationAdapter?.moveCursor?.(cursorTarget);
        } catch {
          // Cursor failure cannot affect audio or authority.
        }
        if (!current(expectedGeneration)) return;
      }
    }

    if (active.index.eventMapping !== "EXACT") {
      return;
    }

    const highlightSet =
      sortedHighlightSet(resolved.highlightRefs);
    if (
      highlightSet === null ||
      highlightSet.key === lastHighlightKey
    ) {
      return;
    }

    let cleared = false;
    try {
      cleared =
        (await notationAdapter?.clearHighlights?.()) === true;
    } catch {
      return;
    }

    if (!current(expectedGeneration) || !cleared) {
      return;
    }

    for (const ref of highlightSet.refs) {
      let highlighted = false;
      try {
        highlighted =
          (await notationAdapter?.highlight?.(ref)) === true;
      } catch {
        highlighted = false;
      }

      if (!current(expectedGeneration)) return;
      if (!highlighted) {
        try {
          await notationAdapter?.clearHighlights?.();
        } catch {
          // Highlight cleanup is best-effort.
        }
        return;
      }
    }

    if (current(expectedGeneration)) {
      lastHighlightKey = highlightSet.key;
    }
  }

  const coordinator = {
    bind({
      pkg,
      sourceId,
      musicXml,
      renderEvidence,
    } = {}) {
      invalidate();

      const packageId = packageIdOf(pkg);
      if (
        packageId === null ||
        sourceId !== packageId ||
        !validIdentity(sourceId) ||
        typeof musicXml !== "string" ||
        musicXml.length === 0 ||
        !validEvidence(renderEvidence, sourceId) ||
        typeof createIndex !== "function" ||
        typeof playbackPort?.getScoreFollowPlaybackContextForPackage !==
          "function" ||
        typeof playbackPort?.subscribePositionForPackage !==
          "function"
      ) {
        return false;
      }

      let playbackContext;
      let index;
      try {
        playbackContext =
          playbackPort.getScoreFollowPlaybackContextForPackage(
            pkg,
          );
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
        typeof index.resolveMeasureHit !== "function" ||
        typeof index.resolveBeat !== "function"
      ) {
        return false;
      }

      const bindGeneration = generation;
      binding = Object.freeze({
        pkg,
        packageId,
        sourceId,
        renderEpoch: renderEvidence.renderEpoch,
        index,
      });

      try {
        unsubscribePosition =
          playbackPort.subscribePositionForPackage(
            pkg,
            (snapshot) => {
              if (!current(bindGeneration)) return;
              void updatePosition(
                snapshot,
                bindGeneration,
              ).catch(() => {});
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

    async handlePoint({ clientX, clientY } = {}) {
      const active = binding;
      const pointGeneration = generation;

      if (
        active === null ||
        !Number.isFinite(clientX) ||
        !Number.isFinite(clientY)
      ) {
        return false;
      }

      let hit;
      try {
        hit = notationAdapter?.hitTestMeasureDetailed?.({
          clientX,
          clientY,
        });
      } catch {
        return false;
      }

      if (
        !current(pointGeneration) ||
        hit === null ||
        typeof hit !== "object" ||
        hit.kind !== "HIT" ||
        hit.sourceId !== active.sourceId ||
        hit.renderEpoch !== active.renderEpoch
      ) {
        return false;
      }

      let range;
      try {
        range = active.index.resolveMeasureHit(
          hit.target,
        );
      } catch {
        return false;
      }

      if (
        !current(pointGeneration) ||
        range === null ||
        typeof range !== "object" ||
        !Number.isFinite(range.startBeat) ||
        !Number.isFinite(range.endBeat) ||
        range.endBeat <= range.startBeat
      ) {
        return false;
      }

      try {
        await playbackPort.playMeasureOnceForPackage(
          active.pkg,
          {
            startBeat: range.startBeat,
            endBeat: range.endBeat,
          },
        );
      } catch {
        return false;
      }

      return current(pointGeneration);
    },

    async clear() {
      const hadBinding = binding !== null;
      nextGeneration();
      unsubscribeCurrent();
      binding = null;
      lastCursorKey = null;
      lastHighlightKey = null;

      if (!hadBinding) return;

      try {
        await notationAdapter?.clearHighlights?.();
      } catch {
        // Renderer presentation cleanup is best-effort.
      }
    },

    async dispose() {
      await coordinator.clear();
    },
  };

  return Object.freeze(coordinator);
}
