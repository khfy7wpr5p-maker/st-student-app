import { SCORE_RENDERER_CONTRACT_VERSION } from "@st/score-renderer-contracts";
import {
  BrowserScoreHost,
  BrowserScoreHostUnavailableError,
  ScoreRendererContractVersionMismatchError,
} from "@st/score-renderer-browser-host";

const root = document.getElementById("st-score-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("ST score runtime root is unavailable.");
}

let activeHost;
let renderInFlight = false;

function createHost() {
  return new BrowserScoreHost(root, {
    expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
  });
}

async function clearActiveHost() {
  const current = activeHost;
  activeHost = undefined;
  if (current !== undefined) {
    try {
      await current.dispose();
    } catch {
      // The presentation container clear below remains the fail-closed authority boundary.
    }
  }
  root.replaceChildren();
}

function requirePayload(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Score render payload must be an object.");
  }
  if (payload.contractVersion !== SCORE_RENDERER_CONTRACT_VERSION) {
    throw new ScoreRendererContractVersionMismatchError(
      SCORE_RENDERER_CONTRACT_VERSION,
      String(payload.contractVersion ?? ""),
    );
  }
  if (typeof payload.musicxml !== "string") {
    throw new TypeError("Score render payload must contain MusicXML text.");
  }
  if (payload.pageMode !== "continuous" && payload.pageMode !== "page") {
    throw new TypeError("Score render pageMode must be continuous or page.");
  }
  for (const key of ["autoResize", "drawTitle", "drawComposer"]) {
    if (typeof payload[key] !== "boolean") {
      throw new TypeError(`Score render ${key} must be boolean.`);
    }
  }
  const ticket = String(payload.ticket ?? "");
  if (!/^[1-9][0-9]{0,18}$/.test(ticket)) {
    throw new TypeError("Score render ticket must be a positive bounded decimal identifier.");
  }
  return {
    musicxml: payload.musicxml,
    ticket,
    options: {
      pageMode: payload.pageMode,
      autoResize: payload.autoResize,
      drawTitle: payload.drawTitle,
      drawComposer: payload.drawComposer,
    },
  };
}

function mapErrorStatus(error) {
  if (error instanceof ScoreRendererContractVersionMismatchError) return "contract_version_mismatch";
  if (error instanceof BrowserScoreHostUnavailableError) return "unavailable";
  if (error instanceof TypeError) return "invalid_request";
  if (error instanceof RangeError) {
    const message = String(error.message ?? "").toLowerCase();
    return message.includes("size") || message.includes("bytes") || message.includes("limit") ||
        message.includes("maximum")
      ? "resource_limit_exceeded"
      : "invalid_request";
  }
  return "adapter_error";
}

const INTERACTION_PART_ID_MAX_LENGTH = 128;
const HIGHLIGHT_CLASS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

function isRealmSafePlainInteractionObject(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const prototype = Object.getPrototypeOf(payload);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

function requirePlainInteractionObject(payload, label, allowedKeys) {
  if (!isRealmSafePlainInteractionObject(payload)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) throw new TypeError(`${label} contains unsupported field '${key}'.`);
  }
  return payload;
}

function requireScoreNoteRef(payload) {
  const target = requirePlainInteractionObject(
    payload,
    "Score note target",
    new Set(["partId", "measureIndex", "noteIndex", "voice"]),
  );
  if (typeof target.partId !== "string" || target.partId.length === 0 ||
      target.partId.length > INTERACTION_PART_ID_MAX_LENGTH || target.partId !== target.partId.trim()) {
    throw new TypeError("Score note partId must be a non-empty bounded string without surrounding whitespace.");
  }
  for (const key of ["measureIndex", "noteIndex"]) {
    if (!Number.isSafeInteger(target[key]) || target[key] < 0) {
      throw new RangeError(`Score note ${key} must be a non-negative safe integer.`);
    }
  }
  if (target.voice !== undefined && (!Number.isSafeInteger(target.voice) || target.voice < 0)) {
    throw new RangeError("Score note voice must be a non-negative safe integer when supplied.");
  }
  return target.voice === undefined
    ? { partId: target.partId, measureIndex: target.measureIndex, noteIndex: target.noteIndex }
    : { partId: target.partId, measureIndex: target.measureIndex, noteIndex: target.noteIndex, voice: target.voice };
}

const runtimeHost = Object.freeze({
  async renderMusicXml(payload) {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError(
        "A score render is already in progress; concurrent replacement is not allowed.",
      );
    }
    renderInFlight = true;
    try {
      let request;
      try {
        request = requirePayload(payload);
      } catch (error) {
        await clearActiveHost();
        throw error;
      }

      const nextHost = activeHost ?? createHost();
      activeHost = nextHost;
      try {
        return await nextHost.renderMusicXml(
          request.musicxml,
          request.options,
          `workstation:${request.ticket}`,
        );
      } catch (error) {
        await clearActiveHost();
        throw error;
      }
    } finally {
      renderInFlight = false;
    }
  },
  async moveCursor(payload) {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError("Cursor movement is unavailable while rendering is in progress.");
    }
    if (activeHost === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before cursor movement.");
    }
    const cursor = requirePlainInteractionObject(
      payload,
      "Score cursor payload",
      new Set(["partId", "measureIndex"]),
    );
    const partId = typeof cursor.partId === "string" ? cursor.partId : "";
    if (!partId || partId.length > INTERACTION_PART_ID_MAX_LENGTH || partId !== partId.trim()) {
      throw new TypeError("Score cursor partId must be a non-empty bounded string without surrounding whitespace.");
    }
    const measureIndex = cursor.measureIndex;
    if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {
      throw new RangeError("Score cursor measureIndex must be a non-negative safe integer.");
    }
    return activeHost.moveCursor({ partId, measureIndex });
  },
  hitTestNote(payload) {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError("Note hit-test is unavailable while rendering is in progress.");
    }
    if (activeHost === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before note hit-test.");
    }
    const point = requirePlainInteractionObject(
      payload,
      "Score note hit-test payload",
      new Set(["clientX", "clientY"]),
    );
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) {
      throw new RangeError("Score note hit-test coordinates must be finite numbers.");
    }
    return activeHost.hitTestNote({ clientX: point.clientX, clientY: point.clientY });
  },
  hitTestNoteDetailed(payload) {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError("Detailed note hit-test is unavailable while rendering is in progress.");
    }
    if (activeHost === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before detailed note hit-test.");
    }
    const point = requirePlainInteractionObject(
      payload,
      "Detailed score note hit-test payload",
      new Set(["clientX", "clientY"]),
    );
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) {
      throw new RangeError("Detailed score note hit-test coordinates must be finite numbers.");
    }
    return activeHost.hitTestNoteDetailed({ clientX: point.clientX, clientY: point.clientY });
  },
  hitTestRenderedEventDetailed(payload) {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError("Detailed rendered event hit-test is unavailable while rendering is in progress.");
    }
    if (activeHost === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before detailed rendered event hit-test.");
    }
    const point = requirePlainInteractionObject(
      payload,
      "Detailed rendered event hit-test payload",
      new Set(["clientX", "clientY"]),
    );
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) {
      throw new RangeError("Detailed rendered event hit-test coordinates must be finite numbers.");
    }
    return activeHost.hitTestRenderedEventDetailed({ clientX: point.clientX, clientY: point.clientY });
  },
  async highlight(payload) {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError("Note highlight is unavailable while rendering is in progress.");
    }
    if (activeHost === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before note highlight.");
    }
    const highlight = requirePlainInteractionObject(
      payload,
      "Score highlight payload",
      new Set(["target", "className"]),
    );
    const target = requireScoreNoteRef(highlight.target);
    if (highlight.className !== undefined &&
        (typeof highlight.className !== "string" || !HIGHLIGHT_CLASS_PATTERN.test(highlight.className))) {
      throw new TypeError("Score highlight className must be one safe CSS class token of at most 64 characters.");
    }
    return activeHost.highlight(
      highlight.className === undefined ? { target } : { target, className: highlight.className },
    );
  },
  async clearHighlights() {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError("Note highlight clearing is unavailable while rendering is in progress.");
    }
    if (activeHost === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before note highlight clearing.");
    }
    return activeHost.clearHighlights();
  },
  async exportSvg() {
    if (renderInFlight) {
      throw new BrowserScoreHostUnavailableError("SVG export is unavailable while rendering is in progress.");
    }
    if (activeHost === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before SVG export.");
    }
    return activeHost.exportSvg();
  },
  async dispose() {
    await clearActiveHost();
  },
});

globalThis.__ST_SCORE_RENDER_HOST__ = runtimeHost;

const readyDetail = Object.freeze({ contractVersion: SCORE_RENDERER_CONTRACT_VERSION });
document.documentElement.dataset.stScoreRuntimeReady = "true";
window.dispatchEvent(new CustomEvent("st-score-render-host-ready", { detail: readyDetail }));
