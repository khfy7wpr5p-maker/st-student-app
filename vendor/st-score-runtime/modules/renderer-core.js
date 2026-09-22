export const DEFAULT_MAX_MUSICXML_BYTES = 5 * 1024 * 1024;
export class InvalidScoreSourceError extends Error {
    code = "INVALID_SCORE_SOURCE";
    constructor(message) {
        super(message);
        this.name = "InvalidScoreSourceError";
    }
}
export class UnsupportedRendererCapabilityError extends Error {
    code = "UNSUPPORTED_RENDERER_CAPABILITY";
    constructor(capability) {
        super(`Renderer capability is not supported: ${capability}`);
        this.name = "UnsupportedRendererCapabilityError";
    }
}
export function validateScoreSource(source, maxBytes = DEFAULT_MAX_MUSICXML_BYTES) {
    if (source.kind !== "musicxml") {
        throw new InvalidScoreSourceError("Only in-memory MusicXML sources are accepted.");
    }
    if (source.content.trim().length === 0) {
        throw new InvalidScoreSourceError("MusicXML content must not be empty.");
    }
    if (source.content.includes("\u0000")) {
        throw new InvalidScoreSourceError("MusicXML content contains a NUL byte.");
    }
    const byteLength = new TextEncoder().encode(source.content).byteLength;
    if (byteLength > maxBytes) {
        throw new InvalidScoreSourceError(`MusicXML exceeds the ${maxBytes}-byte input limit.`);
    }
}
export class RendererRegistry {
    #renderers = new Map();
    register(renderer) {
        if (this.#renderers.has(renderer.id))
            throw new Error(`Renderer already registered: ${renderer.id}`);
        this.#renderers.set(renderer.id, renderer);
    }
    get(id) { return this.#renderers.get(id); }
    list() { return [...this.#renderers.values()]; }
    async disposeAll() {
        const renderers = [...this.#renderers.values()];
        this.#renderers.clear();
        await Promise.all(renderers.map((renderer) => renderer.dispose()));
    }
}
//# sourceMappingURL=index.js.map