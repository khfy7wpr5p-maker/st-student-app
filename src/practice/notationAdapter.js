import { PRACTICE_CAPABILITY_STATES } from "./practiceCapabilities.js";

export const ST_SCORE_RENDERER_CONTRACT_VERSION = "0.2.0";

const SOURCE_ID_MAX_LENGTH = 256;
const RENDER_EPOCH_MAX_LENGTH = 128;

function boundedText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !value.includes("\u0000")
      ? value
      : null
  );
}

function finitePoint(point) {
  return (
    point !== null &&
    typeof point === "object" &&
    Number.isFinite(point.clientX) &&
    Number.isFinite(point.clientY)
  );
}

function frozenTarget(target) {
  return (
    target !== null &&
    typeof target === "object" &&
    !Array.isArray(target)
      ? Object.freeze({ ...target })
      : null
  );
}

export function createStNotationAdapter({
  getRuntime = () => globalThis.__ST_SCORE_RENDER_HOST__,
  runtimeLoader = null,
} = {}) {
  let ticket = 0;
  let activeEvidence = null;

  function runtimeOrNull() {
    let runtime;

    try {
      runtime = getRuntime();
    } catch {
      return null;
    }

    return runtime !== null &&
      runtime !== undefined &&
      typeof runtime.renderMusicXml === "function" &&
      typeof runtime.dispose === "function"
      ? runtime
      : null;
  }

  function nextTicket() {
    ticket = ticket >= Number.MAX_SAFE_INTEGER ? 1 : ticket + 1;
    return String(ticket);
  }

  function clearEvidence() {
    activeEvidence = null;
  }

  function translateDetailedEvidence(result, evidence) {
    if (
      evidence === null ||
      result === null ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      result.renderEpoch !== evidence.renderEpoch ||
      result.sourceId !== evidence.runtimeSourceId
    ) {
      return null;
    }

    if (result.kind === "HIT") {
      const target = frozenTarget(result.target);
      if (target === null) return null;
      return Object.freeze({
        kind: "HIT",
        renderEpoch: evidence.renderEpoch,
        sourceId: evidence.sourceId,
        target,
      });
    }

    if (result.kind === "MISS" && typeof result.reason === "string") {
      return Object.freeze({
        kind: "MISS",
        renderEpoch: evidence.renderEpoch,
        sourceId: evidence.sourceId,
        reason: result.reason,
      });
    }

    return null;
  }

  function detailedHit(methodName, point) {
    if (!finitePoint(point) || activeEvidence === null) {
      return null;
    }

    const runtime = runtimeOrNull();
    if (runtime === null || typeof runtime[methodName] !== "function") {
      return null;
    }

    const evidence = activeEvidence;

    try {
      const result = runtime[methodName]({
        clientX: point.clientX,
        clientY: point.clientY,
      });
      if (activeEvidence !== evidence) {
        return null;
      }
      return translateDetailedEvidence(result, evidence);
    } catch {
      return null;
    }
  }

  async function boundedInteraction(methodName, payload) {
    if (activeEvidence === null) {
      return false;
    }

    const runtime = runtimeOrNull();
    if (runtime === null || typeof runtime[methodName] !== "function") {
      return false;
    }

    const evidence = activeEvidence;

    try {
      if (payload === undefined) {
        await runtime[methodName]();
      } else {
        await runtime[methodName](payload);
      }
      return activeEvidence === evidence;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    isAvailable() {
      if (runtimeOrNull() !== null) return true;
      try {
        return runtimeLoader?.isReady?.() === true || runtimeLoader?.isInstallable?.() === true;
      } catch {
        return false;
      }
    },

    async render({ musicXml, sourceId } = {}) {
      clearEvidence();
      let runtime = runtimeOrNull();

      if (runtime === null && runtimeLoader?.ensureReady) {
        try {
          const readiness = await runtimeLoader.ensureReady();
          if (readiness?.state === "ERROR") {
            return Object.freeze({ capability: PRACTICE_CAPABILITY_STATES.ERROR });
          }
          runtime = runtimeOrNull();
        } catch {
          return Object.freeze({ capability: PRACTICE_CAPABILITY_STATES.ERROR });
        }
      }

      if (runtime === null) {
        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        });
      }

      const requestedSourceId = boundedText(sourceId, SOURCE_ID_MAX_LENGTH);
      const payload = {
        contractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION,
        musicxml: musicXml,
        ticket: nextTicket(),
        pageMode: "continuous",
        autoResize: true,
        drawTitle: false,
        drawComposer: false,
      };
      if (requestedSourceId !== null) {
        payload.sourceId = requestedSourceId;
      }

      try {
        const result = await runtime.renderMusicXml(payload);

        const renderEpoch = boundedText(
          result?.renderEpoch,
          RENDER_EPOCH_MAX_LENGTH,
        );
        const runtimeSourceId = boundedText(
          result?.sourceId,
          SOURCE_ID_MAX_LENGTH,
        );

        if (
          requestedSourceId !== null &&
          renderEpoch !== null &&
          runtimeSourceId !== null
        ) {
          activeEvidence = Object.freeze({
            sourceId: requestedSourceId,
            renderEpoch,
            runtimeSourceId,
          });

          return Object.freeze({
            capability: PRACTICE_CAPABILITY_STATES.AVAILABLE,
            evidence: Object.freeze({
              sourceId: requestedSourceId,
              renderEpoch,
            }),
          });
        }

        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        });
      } catch {
        clearEvidence();
        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.ERROR,
        });
      }
    },

    hitTestMeasureDetailed(point) {
      return detailedHit("hitTestMeasureDetailed", point);
    },

    hitTestRenderedEventDetailed(point) {
      return detailedHit("hitTestRenderedEventDetailed", point);
    },

    moveCursor(target) {
      return boundedInteraction("moveCursor", target);
    },

    highlight(target) {
      return boundedInteraction("highlight", { target });
    },

    clearHighlights() {
      return boundedInteraction("clearHighlights");
    },

    async dispose() {
      clearEvidence();
      const runtime = runtimeOrNull();

      if (runtime === null) {
        return;
      }

      try {
        await runtime.dispose();
      } catch {
        // Renderer disposal details must not escape into Student UI.
      }
    },
  });
}
