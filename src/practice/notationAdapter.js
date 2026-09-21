import { PRACTICE_CAPABILITY_STATES } from "./practiceCapabilities.js";

export const ST_SCORE_RENDERER_CONTRACT_VERSION = "0.2.0";

export function createStNotationAdapter({
  getRuntime = () => globalThis.__ST_SCORE_RENDER_HOST__,
} = {}) {
  let ticket = 0;

  function runtimeOrNull() {
    const runtime = getRuntime();

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

  return Object.freeze({
    isAvailable() {
      return runtimeOrNull() !== null;
    },

    async render({ musicXml }) {
      const runtime = runtimeOrNull();

      if (runtime === null) {
        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        });
      }

      try {
        await runtime.renderMusicXml({
          contractVersion: ST_SCORE_RENDERER_CONTRACT_VERSION,
          musicxml: musicXml,
          ticket: nextTicket(),
          pageMode: "continuous",
          autoResize: true,
          drawTitle: false,
          drawComposer: false,
        });

        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        });
      } catch {
        return Object.freeze({
          capability: PRACTICE_CAPABILITY_STATES.ERROR,
        });
      }
    },

    async dispose() {
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
