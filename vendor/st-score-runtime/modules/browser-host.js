import { SCORE_RENDERER_CONTRACT_VERSION, } from "@st/score-renderer-contracts";
import { validateScoreSource } from "@st/score-renderer-core";
import { OsmdRenderer } from "@st/score-renderer-osmd";
export class ScoreRendererContractVersionMismatchError extends Error {
    expected;
    actual;
    constructor(expected, actual) {
        super(`Score renderer contract mismatch: expected ${expected}, received ${actual}.`);
        this.name = "ScoreRendererContractVersionMismatchError";
        this.expected = expected;
        this.actual = actual;
    }
}
export class BrowserScoreHostUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = "BrowserScoreHostUnavailableError";
    }
}
const DEFAULT_RENDERER_FACTORY = (container) => new OsmdRenderer(container);
const EVIDENCE_SOURCE_ID_MAX_LENGTH = 256;
const NOTE_PART_ID_MAX_LENGTH = 128;
const HIT_MISS_REASONS = new Set([
    "NO_ELEMENT_AT_POINT",
    "OUTSIDE_RENDER_CONTAINER",
    "UNMAPPED_ELEMENT",
    "AMBIGUOUS_OWNERSHIP",
    "NO_NOTE_OWNER",
]);
const RENDERED_EVENT_HIT_MISS_REASONS = new Set([
    "NO_ELEMENT_AT_POINT",
    "OUTSIDE_RENDER_CONTAINER",
    "UNMAPPED_ELEMENT",
    "AMBIGUOUS_OWNERSHIP",
    "UNSUPPORTED_TARGET",
]);
const RENDERED_EVENT_TARGET_KINDS = new Set(["NOTE", "REST"]);
function hasNoteHitTest(renderer) {
    return typeof renderer.resolveNoteAtClientPoint === "function";
}
function hasDetailedNoteHitTest(renderer) {
    return hasNoteHitTest(renderer) &&
        typeof renderer.resolveNoteAtClientPointDetailed === "function";
}
function hasDetailedRenderedEventHitTest(renderer) {
    return typeof renderer.resolveRenderedEventAtClientPointDetailed === "function";
}
function requireFinitePoint(point) {
    if (point === null || typeof point !== "object" || Array.isArray(point)) {
        throw new TypeError("Score note hit-test point must be an object.");
    }
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) {
        throw new RangeError("Score note hit-test coordinates must be finite numbers.");
    }
}
function requirePlainObject(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${label} must be a plain object.`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${label} must be a plain object.`);
    }
    return value;
}
function requireAllowedKeys(value, allowed, label) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key))
            throw new TypeError(`${label} contains unsupported field '${key}'.`);
    }
}
function normalizeScoreNoteRef(value) {
    const target = requirePlainObject(value, "Detailed note hit target");
    requireAllowedKeys(target, new Set(["partId", "measureIndex", "noteIndex", "voice"]), "Detailed note hit target");
    const partId = target.partId;
    if (typeof partId !== "string" || partId.length === 0 || partId.length > NOTE_PART_ID_MAX_LENGTH || partId !== partId.trim()) {
        throw new TypeError("Detailed note hit target partId must be a non-empty bounded string without surrounding whitespace.");
    }
    const measureIndex = target.measureIndex;
    const noteIndex = target.noteIndex;
    if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {
        throw new RangeError("Detailed note hit target measureIndex must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(noteIndex) || noteIndex < 0) {
        throw new RangeError("Detailed note hit target noteIndex must be a non-negative safe integer.");
    }
    const voice = target.voice;
    if (voice !== undefined && (!Number.isSafeInteger(voice) || voice < 0)) {
        throw new RangeError("Detailed note hit target voice must be a non-negative safe integer when supplied.");
    }
    return voice === undefined
        ? Object.freeze({ partId, measureIndex: measureIndex, noteIndex: noteIndex })
        : Object.freeze({ partId, measureIndex: measureIndex, noteIndex: noteIndex, voice: voice });
}
function normalizeRenderedEventTargetRef(value) {
    const target = requirePlainObject(value, "Detailed rendered event hit target");
    requireAllowedKeys(target, new Set(["kind", "partId", "measureIndex", "eventIndex", "voice"]), "Detailed rendered event hit target");
    if (typeof target.kind !== "string" || !RENDERED_EVENT_TARGET_KINDS.has(target.kind)) {
        throw new TypeError("Detailed rendered event hit target kind must be NOTE or REST.");
    }
    const partId = target.partId;
    if (typeof partId !== "string" || partId.length === 0 || partId.length > NOTE_PART_ID_MAX_LENGTH || partId !== partId.trim()) {
        throw new TypeError("Detailed rendered event hit target partId must be a non-empty bounded string without surrounding whitespace.");
    }
    const measureIndex = target.measureIndex;
    const eventIndex = target.eventIndex;
    if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {
        throw new RangeError("Detailed rendered event hit target measureIndex must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(eventIndex) || eventIndex < 0) {
        throw new RangeError("Detailed rendered event hit target eventIndex must be a non-negative safe integer.");
    }
    const voice = target.voice;
    if (voice !== undefined && (!Number.isSafeInteger(voice) || voice < 0)) {
        throw new RangeError("Detailed rendered event hit target voice must be a non-negative safe integer when supplied.");
    }
    const kind = target.kind;
    return voice === undefined
        ? Object.freeze({ kind, partId, measureIndex: measureIndex, eventIndex: eventIndex })
        : Object.freeze({ kind, partId, measureIndex: measureIndex, eventIndex: eventIndex, voice: voice });
}
function normalizeDetailedRendererHit(value) {
    const result = requirePlainObject(value, "Detailed note hit result");
    if (result.kind === "HIT") {
        requireAllowedKeys(result, new Set(["kind", "target"]), "Detailed note hit result");
        return Object.freeze({ kind: "HIT", target: normalizeScoreNoteRef(result.target) });
    }
    if (result.kind === "MISS") {
        requireAllowedKeys(result, new Set(["kind", "reason"]), "Detailed note hit result");
        if (typeof result.reason !== "string" || !HIT_MISS_REASONS.has(result.reason)) {
            throw new TypeError("Detailed note hit result contains an unsupported miss reason.");
        }
        return Object.freeze({ kind: "MISS", reason: result.reason });
    }
    throw new TypeError("Detailed note hit result kind must be HIT or MISS.");
}
function normalizeDetailedRenderedEventHit(value) {
    const result = requirePlainObject(value, "Detailed rendered event hit result");
    if (result.kind === "HIT") {
        requireAllowedKeys(result, new Set(["kind", "target"]), "Detailed rendered event hit result");
        return Object.freeze({ kind: "HIT", target: normalizeRenderedEventTargetRef(result.target) });
    }
    if (result.kind === "MISS") {
        requireAllowedKeys(result, new Set(["kind", "reason"]), "Detailed rendered event hit result");
        if (typeof result.reason !== "string" || !RENDERED_EVENT_HIT_MISS_REASONS.has(result.reason)) {
            throw new TypeError("Detailed rendered event hit result contains an unsupported miss reason.");
        }
        return Object.freeze({ kind: "MISS", reason: result.reason });
    }
    throw new TypeError("Detailed rendered event hit result kind must be HIT or MISS.");
}
function boundedEvidenceSourceId(sourceId) {
    if (sourceId === undefined)
        return undefined;
    if (sourceId.length === 0 || sourceId.length > EVIDENCE_SOURCE_ID_MAX_LENGTH || sourceId !== sourceId.trim() || sourceId.includes("\u0000")) {
        return undefined;
    }
    return sourceId;
}
/**
 * Browser-only presentation host for ST score rendering.
 *
 * The host accepts bounded in-memory MusicXML, verifies the ST runtime contract,
 * owns only its presentation container, and delegates rendering through the
 * ST renderer adapter boundary. It does not grant filesystem, network, project,
 * transport, MIDI, audio, plugin, AI, or realtime authority.
 */
export class BrowserScoreHost {
    #container;
    #expectedContractVersion;
    #rendererFactory;
    #renderer;
    #disposed = false;
    #renderInFlight = false;
    #renderEpochCounter = 0;
    #activeRenderEpoch;
    #activeEvidenceSourceId;
    constructor(container, options) {
        if (typeof container?.replaceChildren !== "function") {
            throw new TypeError("BrowserScoreHost requires an HTMLElement-like presentation container.");
        }
        if (options.expectedContractVersion !== SCORE_RENDERER_CONTRACT_VERSION) {
            throw new ScoreRendererContractVersionMismatchError(options.expectedContractVersion, SCORE_RENDERER_CONTRACT_VERSION);
        }
        this.#container = container;
        this.#expectedContractVersion = options.expectedContractVersion;
        this.#rendererFactory = options.rendererFactory ?? DEFAULT_RENDERER_FACTORY;
    }
    get expectedContractVersion() {
        return this.#expectedContractVersion;
    }
    async renderMusicXml(content, options = {}, sourceId) {
        this.#requireAvailable();
        if (this.#renderInFlight) {
            throw new BrowserScoreHostUnavailableError("A score render is already in progress; concurrent replacement is not allowed.");
        }
        this.#renderInFlight = true;
        try {
            const source = sourceId === undefined
                ? { kind: "musicxml", content }
                : { kind: "musicxml", content, sourceId };
            try {
                validateScoreSource(source);
            }
            catch (error) {
                await this.#resetCurrentRenderer();
                throw error;
            }
            await this.#resetCurrentRenderer();
            this.#requireAvailable();
            try {
                const renderer = this.#rendererFactory(this.#container);
                this.#renderer = renderer;
                if (!renderer.capabilities.has("musicxml-render") || !renderer.capabilities.has("svg-export")) {
                    throw new BrowserScoreHostUnavailableError("Selected renderer does not provide the required browser-host capabilities.");
                }
                await renderer.load(source);
                this.#requireAvailable();
                const result = await renderer.render(options);
                this.#requireAvailable();
                if (result.contractVersion !== this.#expectedContractVersion) {
                    throw new ScoreRendererContractVersionMismatchError(this.#expectedContractVersion, result.contractVersion);
                }
                const renderEpoch = this.#nextRenderEpoch();
                const evidenceSourceId = boundedEvidenceSourceId(sourceId);
                this.#activeRenderEpoch = renderEpoch;
                this.#activeEvidenceSourceId = evidenceSourceId;
                return evidenceSourceId === undefined
                    ? Object.freeze({ ...result, renderEpoch })
                    : Object.freeze({ ...result, renderEpoch, sourceId: evidenceSourceId });
            }
            catch (error) {
                await this.#resetCurrentRenderer();
                throw error;
            }
        }
        finally {
            this.#renderInFlight = false;
        }
    }
    async exportSvg() {
        const renderer = this.#requireRenderer("SVG export");
        return renderer.exportSvg();
    }
    async moveCursor(target) {
        const renderer = this.#requireRenderer("Measure cursor");
        if (!renderer.capabilities.has("cursor")) {
            throw new BrowserScoreHostUnavailableError("Selected renderer does not provide measure cursor capability.");
        }
        await renderer.moveCursor(target);
    }
    hitTestNote(point) {
        requireFinitePoint(point);
        const renderer = this.#requireRenderer("Note hit-test");
        if (!hasNoteHitTest(renderer)) {
            throw new BrowserScoreHostUnavailableError("Selected renderer does not provide note hit-test capability.");
        }
        return renderer.resolveNoteAtClientPoint(point);
    }
    hitTestNoteDetailed(point) {
        requireFinitePoint(point);
        const renderer = this.#requireRenderer("Detailed note hit-test");
        if (!hasDetailedNoteHitTest(renderer)) {
            throw new BrowserScoreHostUnavailableError("Selected renderer does not provide detailed note hit-test capability.");
        }
        const renderEpoch = this.#activeRenderEpoch;
        if (renderEpoch === undefined) {
            throw new BrowserScoreHostUnavailableError("Detailed note hit-test requires an active render epoch.");
        }
        const result = normalizeDetailedRendererHit(renderer.resolveNoteAtClientPointDetailed(point));
        const sourceId = this.#activeEvidenceSourceId;
        if (result.kind === "HIT") {
            return sourceId === undefined
                ? Object.freeze({ kind: "HIT", renderEpoch, target: result.target })
                : Object.freeze({ kind: "HIT", renderEpoch, sourceId, target: result.target });
        }
        return sourceId === undefined
            ? Object.freeze({ kind: "MISS", renderEpoch, reason: result.reason })
            : Object.freeze({ kind: "MISS", renderEpoch, sourceId, reason: result.reason });
    }
    hitTestRenderedEventDetailed(point) {
        requireFinitePoint(point);
        const renderer = this.#requireRenderer("Detailed rendered event hit-test");
        if (!hasDetailedRenderedEventHitTest(renderer)) {
            throw new BrowserScoreHostUnavailableError("Selected renderer does not provide detailed rendered event hit-test capability.");
        }
        const renderEpoch = this.#activeRenderEpoch;
        if (renderEpoch === undefined) {
            throw new BrowserScoreHostUnavailableError("Detailed rendered event hit-test requires an active render epoch.");
        }
        const result = normalizeDetailedRenderedEventHit(renderer.resolveRenderedEventAtClientPointDetailed(point));
        const sourceId = this.#activeEvidenceSourceId;
        if (result.kind === "HIT") {
            return sourceId === undefined
                ? Object.freeze({ kind: "HIT", renderEpoch, target: result.target })
                : Object.freeze({ kind: "HIT", renderEpoch, sourceId, target: result.target });
        }
        return sourceId === undefined
            ? Object.freeze({ kind: "MISS", renderEpoch, reason: result.reason })
            : Object.freeze({ kind: "MISS", renderEpoch, sourceId, reason: result.reason });
    }
    async highlight(highlight) {
        const renderer = this.#requireRenderer("Note highlight");
        if (!renderer.capabilities.has("note-highlight")) {
            throw new BrowserScoreHostUnavailableError("Selected renderer does not provide note highlight capability.");
        }
        await renderer.highlight(highlight);
    }
    async clearHighlights() {
        const renderer = this.#requireRenderer("Note highlight clearing");
        if (!renderer.capabilities.has("note-highlight")) {
            throw new BrowserScoreHostUnavailableError("Selected renderer does not provide note highlight capability.");
        }
        await renderer.clearHighlights();
    }
    async dispose() {
        if (this.#disposed)
            return;
        this.#disposed = true;
        await this.#resetCurrentRenderer();
    }
    #nextRenderEpoch() {
        if (this.#renderEpochCounter >= Number.MAX_SAFE_INTEGER) {
            throw new BrowserScoreHostUnavailableError("Render epoch space is exhausted for this browser host instance.");
        }
        this.#renderEpochCounter += 1;
        return `render-${this.#renderEpochCounter.toString(36)}`;
    }
    #requireAvailable() {
        if (this.#disposed) {
            throw new BrowserScoreHostUnavailableError("BrowserScoreHost has been disposed.");
        }
    }
    #requireRenderer(operation) {
        this.#requireAvailable();
        if (this.#renderInFlight) {
            throw new BrowserScoreHostUnavailableError(`${operation} is unavailable while rendering is in progress.`);
        }
        const renderer = this.#renderer;
        if (renderer === undefined) {
            throw new BrowserScoreHostUnavailableError(`A score must be rendered before ${operation.toLowerCase()}.`);
        }
        return renderer;
    }
    async #resetCurrentRenderer() {
        const renderer = this.#renderer;
        this.#renderer = undefined;
        this.#activeRenderEpoch = undefined;
        this.#activeEvidenceSourceId = undefined;
        if (renderer !== undefined) {
            try {
                await renderer.dispose();
            }
            catch {
                // Container clearing below is the fail-closed authority boundary.
            }
        }
        this.#container.replaceChildren();
    }
}
//# sourceMappingURL=index.js.map