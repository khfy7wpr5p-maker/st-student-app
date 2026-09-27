import * as OsmdModule from "opensheetmusicdisplay";
import { SCORE_RENDERER_CONTRACT_VERSION, } from "@st/score-renderer-contracts";
import { validateScoreSource } from "@st/score-renderer-core";
const CAPABILITIES = new Set([
    "musicxml-render",
    "svg-export",
    "cursor",
    "note-highlight",
    "part-visibility",
    "tablature",
]);
const DEFAULT_HIGHLIGHT_CLASS = "st-score-highlight";
const HIGHLIGHT_CLASS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const MAX_HIT_TEST_NOTE_ELEMENTS = 200_000;
const MAX_MEASURE_HIT_REGIONS = 100_000;
const MEASURE_PART_ID_MAX_LENGTH = 128;
const OSMD_SVG_UNITS_PER_UNIT = 10;
const OSMD_SVG_PAGE_ID_PREFIX = "osmdSvgPage";
const AMBIGUOUS_HIT_OWNER = "AMBIGUOUS";
const NO_NOTE_HIT_OWNER = "NO_NOTE_OWNER";
function resolveOpenSheetMusicDisplay() {
    const moduleShape = OsmdModule;
    const constructor = moduleShape.OpenSheetMusicDisplay ?? moduleShape.default?.OpenSheetMusicDisplay;
    if (constructor === undefined) {
        throw new Error("OpenSheetMusicDisplay constructor is unavailable from the installed module.");
    }
    return constructor;
}
function createDefaultOsmd(container) {
    const OpenSheetMusicDisplay = resolveOpenSheetMusicDisplay();
    return new OpenSheetMusicDisplay(container, { autoResize: true, backend: "svg" });
}
function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${label} must be a non-negative safe integer.`);
    }
}
function requireFiniteCoordinate(value, label) {
    if (!Number.isFinite(value))
        throw new RangeError(`${label} must be a finite number.`);
}
function voiceId(entry) {
    return entry.parentVoiceEntry?.ParentVoice?.VoiceId ?? entry.parentVoiceEntry?.parentVoice?.VoiceId;
}
function normalizedVoiceId(entry) {
    const value = voiceId(entry);
    return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function sameScoreNoteRef(left, right) {
    return left.partId === right.partId
        && left.measureIndex === right.measureIndex
        && left.noteIndex === right.noteIndex
        && left.voice === right.voice;
}
function sameRenderedEventTargetRef(left, right) {
    return left.kind === right.kind
        && left.partId === right.partId
        && left.measureIndex === right.measureIndex
        && left.eventIndex === right.eventIndex
        && left.voice === right.voice;
}
function miss(reason) {
    return Object.freeze({ kind: "MISS", reason });
}
function hit(target) {
    return Object.freeze({ kind: "HIT", target });
}
function renderedEventMiss(reason) {
    return Object.freeze({ kind: "MISS", reason });
}
function renderedEventHit(target) {
    return Object.freeze({ kind: "HIT", target });
}
function measureMiss(reason) {
    return Object.freeze({ kind: "MISS", reason });
}
function measureHit(target) {
    return Object.freeze({ kind: "HIT", target });
}
function sameMeasureHitTarget(left, right) {
    return left.partId === right.partId && left.measureIndex === right.measureIndex;
}
function isBoundedMeasurePartId(value) {
    return value.length > 0
        && value.length <= MEASURE_PART_ID_MAX_LENGTH
        && value === value.trim();
}
function isScoreNoteRefOwner(owner) {
    return owner !== AMBIGUOUS_HIT_OWNER && owner !== NO_NOTE_HIT_OWNER;
}
function isRenderedEventRefOwner(owner) {
    return owner !== AMBIGUOUS_HIT_OWNER;
}
export class OsmdRenderer {
    id = "osmd";
    capabilities = CAPABILITIES;
    #container;
    #factory;
    #highlighted = new Map();
    #noteRefByElement = new WeakMap();
    #renderedEventRefByElement = new WeakMap();
    #measureHitRegions = Object.freeze([]);
    #measureGeometryAvailable = false;
    #osmd;
    #loaded = false;
    #rendered = false;
    constructor(container, factory = createDefaultOsmd) {
        this.#container = container;
        this.#factory = factory;
    }
    async load(source) {
        validateScoreSource(source);
        await this.clearHighlights();
        this.#resetHitTestIndex();
        const osmd = this.#ensureOsmd();
        await osmd.load(source.content);
        this.#loaded = true;
        this.#rendered = false;
    }
    async render(options = {}) {
        if (!this.#loaded)
            throw new Error("A MusicXML score must be loaded before render().");
        await this.clearHighlights();
        this.#resetHitTestIndex();
        const osmd = this.#ensureOsmd();
        osmd.setOptions({
            autoResize: options.autoResize ?? true,
            drawTitle: options.drawTitle ?? true,
            drawComposer: options.drawComposer ?? true,
            pageFormat: options.pageMode === "page" ? "A4 P" : "Endless",
        });
        osmd.render();
        this.#rendered = true;
        try {
            this.#rebuildHitTestIndex();
        }
        catch (error) {
            this.#rendered = false;
            this.#resetHitTestIndex();
            throw error;
        }
        return { rendererId: this.id, contractVersion: SCORE_RENDERER_CONTRACT_VERSION };
    }
    async exportSvg() {
        return [...this.#container.querySelectorAll("svg")].map((node) => node.outerHTML);
    }
    resolveRenderedNoteElement(target) {
        this.#requireRendered("resolveRenderedNoteElement()");
        return this.#resolveExactNoteheadElement(this.#resolveGraphicalNote(target));
    }
    resolveNoteAtClientPoint(point) {
        const result = this.resolveNoteAtClientPointDetailed(point);
        return result.kind === "HIT" ? result.target : null;
    }
    resolveNoteAtClientPointDetailed(point) {
        this.#requireRendered("resolveNoteAtClientPointDetailed()");
        requireFiniteCoordinate(point.clientX, "clientX");
        requireFiniteCoordinate(point.clientY, "clientY");
        const document = this.#container.ownerDocument;
        const initial = document.elementFromPoint(point.clientX, point.clientY);
        const stacked = typeof document.elementsFromPoint === "function"
            ? document.elementsFromPoint(point.clientX, point.clientY)
            : [];
        const candidates = [];
        if (initial !== null)
            candidates.push(initial);
        for (const element of stacked) {
            if (!candidates.includes(element))
                candidates.push(element);
        }
        if (candidates.length === 0)
            return miss("NO_ELEMENT_AT_POINT");
        // Preserve topmost known non-note ownership. On iOS/SVG, elementsFromPoint()
        // can also expose a lower note group at the same coordinates. A rendered rest
        // must not fall through to that lower note and become a false note HIT.
        if (initial !== null) {
            const topOwnership = this.#resolveElementOwnership(initial);
            if (topOwnership.reason === "NO_NOTE_OWNER")
                return miss("NO_NOTE_OWNER");
        }
        let resolved;
        let sawInsideContainer = false;
        let sawAmbiguous = false;
        let sawNoNoteOwner = false;
        for (const candidate of candidates) {
            const ownership = this.#resolveElementOwnership(candidate);
            sawInsideContainer ||= ownership.insideContainer;
            if (ownership.reason === "AMBIGUOUS_OWNERSHIP")
                sawAmbiguous = true;
            if (ownership.reason === "NO_NOTE_OWNER")
                sawNoNoteOwner = true;
            if (ownership.target === undefined)
                continue;
            if (resolved !== undefined && !sameScoreNoteRef(resolved, ownership.target)) {
                return miss("AMBIGUOUS_OWNERSHIP");
            }
            resolved = ownership.target;
        }
        if (resolved !== undefined)
            return hit(resolved);
        if (!sawInsideContainer)
            return miss("OUTSIDE_RENDER_CONTAINER");
        if (sawAmbiguous)
            return miss("AMBIGUOUS_OWNERSHIP");
        if (sawNoNoteOwner)
            return miss("NO_NOTE_OWNER");
        return miss("UNMAPPED_ELEMENT");
    }
    resolveMeasureAtClientPointDetailed(point) {
        this.#requireRendered("resolveMeasureAtClientPointDetailed()");
        requireFiniteCoordinate(point.clientX, "clientX");
        requireFiniteCoordinate(point.clientY, "clientY");
        const initial = this.#container.ownerDocument.elementFromPoint(point.clientX, point.clientY);
        if (initial === null)
            return measureMiss("NO_ELEMENT_AT_POINT");
        if (!this.#isInsideContainer(initial))
            return measureMiss("OUTSIDE_RENDER_CONTAINER");
        const pageResolution = this.#resolveMeasurePage(initial);
        if (pageResolution.kind === "UNMAPPED")
            return measureMiss("UNMAPPED_ELEMENT");
        if (pageResolution.kind === "UNAVAILABLE" || !this.#measureGeometryAvailable) {
            return measureMiss("MEASURE_GEOMETRY_UNAVAILABLE");
        }
        const projected = this.#projectClientPointToOsmd(pageResolution.pageNumber, point);
        if (projected === undefined)
            return measureMiss("MEASURE_GEOMETRY_UNAVAILABLE");
        const targets = [];
        for (const region of this.#measureHitRegions) {
            if (region.pageNumber !== pageResolution.pageNumber)
                continue;
            if (projected.x < region.left || projected.x > region.right
                || projected.y < region.top || projected.y > region.bottom)
                continue;
            if (!targets.some((candidate) => sameMeasureHitTarget(candidate, region.target))) {
                targets.push(region.target);
            }
        }
        if (targets.length === 0)
            return measureMiss("NO_MEASURE_OWNER");
        if (targets.length > 1)
            return measureMiss("AMBIGUOUS_OWNERSHIP");
        const target = targets[0];
        if (target === undefined)
            return measureMiss("NO_MEASURE_OWNER");
        return measureHit(target);
    }
    resolveRenderedEventAtClientPointDetailed(point) {
        this.#requireRendered("resolveRenderedEventAtClientPointDetailed()");
        requireFiniteCoordinate(point.clientX, "clientX");
        requireFiniteCoordinate(point.clientY, "clientY");
        const document = this.#container.ownerDocument;
        const initial = document.elementFromPoint(point.clientX, point.clientY);
        const stacked = typeof document.elementsFromPoint === "function"
            ? document.elementsFromPoint(point.clientX, point.clientY)
            : [];
        const candidates = [];
        if (initial !== null)
            candidates.push(initial);
        for (const element of stacked) {
            if (!candidates.includes(element))
                candidates.push(element);
        }
        if (candidates.length === 0)
            return renderedEventMiss("NO_ELEMENT_AT_POINT");
        // Generic targeting gives the exact topmost rendered owner precedence. This is
        // the key difference from the legacy note-only bridge: a rest is now a HIT,
        // not a NO_NOTE_OWNER miss that can fall through to a lower note.
        if (initial !== null) {
            const topOwnership = this.#resolveRenderedEventOwnership(initial);
            if (topOwnership.reason === "AMBIGUOUS_OWNERSHIP")
                return renderedEventMiss("AMBIGUOUS_OWNERSHIP");
            if (topOwnership.target !== undefined)
                return renderedEventHit(topOwnership.target);
        }
        let resolved;
        let sawInsideContainer = false;
        let sawAmbiguous = false;
        for (const candidate of candidates) {
            const ownership = this.#resolveRenderedEventOwnership(candidate);
            sawInsideContainer ||= ownership.insideContainer;
            if (ownership.reason === "AMBIGUOUS_OWNERSHIP")
                sawAmbiguous = true;
            if (ownership.target === undefined)
                continue;
            if (resolved !== undefined && !sameRenderedEventTargetRef(resolved, ownership.target)) {
                return renderedEventMiss("AMBIGUOUS_OWNERSHIP");
            }
            resolved = ownership.target;
        }
        if (resolved !== undefined)
            return renderedEventHit(resolved);
        if (!sawInsideContainer)
            return renderedEventMiss("OUTSIDE_RENDER_CONTAINER");
        if (sawAmbiguous)
            return renderedEventMiss("AMBIGUOUS_OWNERSHIP");
        return renderedEventMiss("UNMAPPED_ELEMENT");
    }
    async highlight(highlight) {
        this.#requireRendered("highlight()");
        const className = highlight.className ?? DEFAULT_HIGHLIGHT_CLASS;
        if (!HIGHLIGHT_CLASS_PATTERN.test(className)) {
            throw new Error("Highlight className must be one safe CSS class token of at most 64 characters.");
        }
        const element = this.resolveRenderedNoteElement(highlight.target);
        this.#ensureHighlightStyle();
        element.classList.add(className);
        element.setAttribute("data-st-score-highlight", "true");
        this.#highlighted.set(element, className);
    }
    async clearHighlights() {
        for (const [element, className] of this.#highlighted) {
            element.classList.remove(className);
            element.removeAttribute("data-st-score-highlight");
        }
        this.#highlighted.clear();
    }
    async moveCursor(target) {
        this.#requireRendered("moveCursor()");
        requireNonNegativeInteger(target.measureIndex, "measureIndex");
        const osmd = this.#ensureOsmd();
        this.#findInstrument(target.partId);
        const measureCount = osmd.Sheet?.SourceMeasures?.length;
        if (measureCount !== undefined && target.measureIndex >= measureCount) {
            throw new RangeError(`measureIndex ${target.measureIndex} is outside the loaded score.`);
        }
        const cursor = osmd.cursor;
        if (!cursor)
            throw new Error("OSMD cursor is unavailable for the loaded score.");
        cursor.reset();
        cursor.show();
        let current = cursor.iterator?.CurrentMeasureIndex;
        let steps = 0;
        const maxSteps = (measureCount ?? target.measureIndex + 1) + 2;
        while (current !== target.measureIndex && steps < maxSteps) {
            if (current !== undefined && current > target.measureIndex)
                break;
            if (cursor.nextMeasure)
                cursor.nextMeasure();
            else
                cursor.next();
            current = cursor.iterator?.CurrentMeasureIndex;
            steps += 1;
        }
        if (current !== target.measureIndex) {
            throw new Error(`OSMD cursor could not reach measureIndex ${target.measureIndex}.`);
        }
    }
    async setPartVisible(part, visible) {
        if (!this.#loaded)
            throw new Error("A MusicXML score must be loaded before setPartVisible().");
        const osmd = this.#ensureOsmd();
        const instrument = this.#findInstrument(part.partId);
        await this.clearHighlights();
        this.#resetHitTestIndex();
        instrument.Visible = visible;
        if (!osmd.updateGraphic)
            throw new Error("OSMD updateGraphic() is unavailable for part visibility changes.");
        osmd.updateGraphic();
        osmd.render();
        this.#rendered = true;
        try {
            this.#rebuildHitTestIndex();
        }
        catch (error) {
            this.#rendered = false;
            this.#resetHitTestIndex();
            throw error;
        }
    }
    async dispose() {
        await this.clearHighlights();
        this.#resetHitTestIndex();
        this.#container.replaceChildren();
        this.#osmd = undefined;
        this.#loaded = false;
        this.#rendered = false;
    }
    #ensureOsmd() {
        if (this.#osmd === undefined)
            this.#osmd = this.#factory(this.#container);
        return this.#osmd;
    }
    #requireRendered(operation) {
        if (!this.#rendered)
            throw new Error(`A score must be rendered before ${operation}.`);
    }
    #findInstrument(partId) {
        if (partId.trim().length === 0)
            throw new Error("partId must not be empty.");
        const instrument = this.#ensureOsmd().Sheet?.Instruments?.find((candidate) => candidate.IdString === partId);
        if (!instrument)
            throw new Error(`Part '${partId}' was not found in the loaded score.`);
        return instrument;
    }
    #listGraphicalNotes(partId, measureIndex) {
        const osmd = this.#ensureOsmd();
        const instrument = this.#findInstrument(partId);
        const measure = osmd.graphic?.measureList?.[measureIndex];
        if (!measure)
            throw new Error(`Rendered measure ${measureIndex} is unavailable.`);
        const indexedNotes = [];
        const voiceIndexes = new Map();
        let globalIndex = 0;
        const staffIds = instrument.Staves.map((staff) => staff.idInMusicSheet).sort((a, b) => a - b);
        for (const staffId of staffIds) {
            const graphicalMeasure = measure[staffId];
            for (const staffEntry of graphicalMeasure?.staffEntries ?? []) {
                for (const graphicalVoiceEntry of staffEntry.graphicalVoiceEntries ?? []) {
                    const voice = normalizedVoiceId(graphicalVoiceEntry);
                    for (const note of graphicalVoiceEntry.notes ?? []) {
                        if (voice === undefined) {
                            indexedNotes.push(Object.freeze({ note, globalIndex }));
                        }
                        else {
                            const voiceIndex = voiceIndexes.get(voice) ?? 0;
                            indexedNotes.push(Object.freeze({ note, globalIndex, voice, voiceIndex }));
                            voiceIndexes.set(voice, voiceIndex + 1);
                        }
                        globalIndex += 1;
                    }
                }
            }
        }
        return indexedNotes;
    }
    #resolveGraphicalNote(target) {
        requireNonNegativeInteger(target.measureIndex, "measureIndex");
        requireNonNegativeInteger(target.noteIndex, "noteIndex");
        if (target.voice !== undefined)
            requireNonNegativeInteger(target.voice, "voice");
        const notes = this.#listGraphicalNotes(target.partId, target.measureIndex);
        const selected = target.voice === undefined
            ? notes.find((entry) => entry.globalIndex === target.noteIndex)
            : notes.find((entry) => entry.voice === target.voice && entry.voiceIndex === target.noteIndex);
        if (selected === undefined) {
            const voiceSuffix = target.voice === undefined ? "" : ` for voice ${target.voice}`;
            throw new Error(`Rendered note ${target.noteIndex}${voiceSuffix} was not found in part '${target.partId}', measure ${target.measureIndex}.`);
        }
        return selected.note;
    }
    #isRest(note) {
        const isRest = note.sourceNote?.isRest;
        return typeof isRest === "function" && isRest.call(note.sourceNote) === true;
    }
    #resolveExactNoteheadElement(note) {
        if (this.#isRest(note)) {
            throw new Error("The selected score entry is a rest and has no notehead interaction target.");
        }
        const noteheads = note.getNoteheadSVGs?.();
        if (!Array.isArray(noteheads) || noteheads.length === 0) {
            throw new Error("OSMD did not expose notehead SVG elements for the selected note.");
        }
        const rawIndex = note.vfnoteIndex;
        const index = Number.isSafeInteger(rawIndex) && rawIndex >= 0
            ? rawIndex
            : noteheads.length === 1
                ? 0
                : undefined;
        if (index === undefined) {
            throw new Error("OSMD did not expose a valid notehead index for an ambiguous multi-note graphical entry.");
        }
        const element = noteheads[index];
        const ElementConstructor = this.#container.ownerDocument.defaultView?.Element;
        if (ElementConstructor === undefined || !(element instanceof ElementConstructor)) {
            throw new Error("OSMD did not expose an exact SVG notehead element for the selected note.");
        }
        return element;
    }
    #resolveOwnedGraphicalGroup(note) {
        const group = note.getSVGGElement?.();
        const ElementConstructor = this.#container.ownerDocument.defaultView?.Element;
        return ElementConstructor !== undefined && group instanceof ElementConstructor ? group : null;
    }
    #resolveElementOwnership(initial) {
        let current = initial;
        let resolved;
        while (current !== null) {
            if (current === this.#container) {
                return resolved === undefined
                    ? Object.freeze({ insideContainer: true })
                    : Object.freeze({ insideContainer: true, target: resolved });
            }
            const owner = this.#noteRefByElement.get(current);
            if (owner === AMBIGUOUS_HIT_OWNER) {
                if (resolved === undefined) {
                    return Object.freeze({ insideContainer: true, reason: "AMBIGUOUS_OWNERSHIP" });
                }
            }
            else if (owner === NO_NOTE_HIT_OWNER) {
                if (resolved === undefined) {
                    return Object.freeze({ insideContainer: true, reason: "NO_NOTE_OWNER" });
                }
            }
            else if (owner !== undefined) {
                if (resolved !== undefined && !sameScoreNoteRef(resolved, owner)) {
                    return Object.freeze({ insideContainer: true, reason: "AMBIGUOUS_OWNERSHIP" });
                }
                resolved = owner;
            }
            current = current.parentElement;
        }
        return Object.freeze({ insideContainer: false });
    }
    #resolveRenderedEventOwnership(initial) {
        let current = initial;
        let resolved;
        while (current !== null) {
            if (current === this.#container) {
                return resolved === undefined
                    ? Object.freeze({ insideContainer: true })
                    : Object.freeze({ insideContainer: true, target: resolved });
            }
            const owner = this.#renderedEventRefByElement.get(current);
            if (owner === AMBIGUOUS_HIT_OWNER) {
                return Object.freeze({ insideContainer: true, reason: "AMBIGUOUS_OWNERSHIP" });
            }
            if (owner !== undefined) {
                if (resolved !== undefined && !sameRenderedEventTargetRef(resolved, owner)) {
                    return Object.freeze({ insideContainer: true, reason: "AMBIGUOUS_OWNERSHIP" });
                }
                resolved = owner;
            }
            current = current.parentElement;
        }
        return Object.freeze({ insideContainer: false });
    }
    #rebuildHitTestIndex() {
        this.#resetHitTestIndex();
        const osmd = this.#ensureOsmd();
        const instruments = osmd.Sheet?.Instruments ?? [];
        const measureCount = osmd.graphic?.measureList?.length ?? 0;
        let indexedGraphicalNoteCount = 0;
        for (const instrument of instruments) {
            for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
                const entries = this.#listGraphicalNotes(instrument.IdString, measureIndex);
                for (const entry of entries) {
                    indexedGraphicalNoteCount += 1;
                    if (indexedGraphicalNoteCount > MAX_HIT_TEST_NOTE_ELEMENTS) {
                        throw new RangeError(`Rendered note hit-test index exceeds ${MAX_HIT_TEST_NOTE_ELEMENTS} graphical notes.`);
                    }
                    const eventIndex = entry.voice === undefined ? entry.globalIndex : entry.voiceIndex;
                    const eventTarget = entry.voice === undefined
                        ? Object.freeze({
                            kind: this.#isRest(entry.note) ? "REST" : "NOTE",
                            partId: instrument.IdString,
                            measureIndex,
                            eventIndex,
                        })
                        : Object.freeze({
                            kind: this.#isRest(entry.note) ? "REST" : "NOTE",
                            partId: instrument.IdString,
                            measureIndex,
                            eventIndex,
                            voice: entry.voice,
                        });
                    if (this.#isRest(entry.note)) {
                        const restGroup = this.#resolveOwnedGraphicalGroup(entry.note);
                        if (restGroup !== null) {
                            this.#registerHitTestElement(restGroup, NO_NOTE_HIT_OWNER);
                            this.#registerRenderedEventHitTestElement(restGroup, eventTarget);
                        }
                        continue;
                    }
                    const target = entry.voice === undefined
                        ? Object.freeze({ partId: instrument.IdString, measureIndex, noteIndex: entry.globalIndex })
                        : Object.freeze({
                            partId: instrument.IdString,
                            measureIndex,
                            noteIndex: entry.voiceIndex,
                            voice: entry.voice,
                        });
                    const group = this.#resolveOwnedGraphicalGroup(entry.note);
                    // VexFlow TAB frets can render as text without a notehead. A group from
                    // this same GraphicalNote is a usable ownership candidate; shared
                    // groups become ambiguous through #registerHitTestElement below.
                    const noteheads = entry.note.getNoteheadSVGs?.();
                    const element = Array.isArray(noteheads) && noteheads.length === 0
                        ? group
                        : this.#resolveExactNoteheadElement(entry.note);
                    if (element === null)
                        continue;
                    this.#registerHitTestElement(element, target);
                    this.#registerRenderedEventHitTestElement(element, eventTarget);
                    if (group !== null && group !== element) {
                        this.#registerHitTestElement(group, target);
                        this.#registerRenderedEventHitTestElement(group, eventTarget);
                    }
                }
            }
        }
        this.#rebuildMeasureHitIndex();
    }
    #rebuildMeasureHitIndex() {
        try {
            const osmd = this.#ensureOsmd();
            const instruments = osmd.Sheet?.Instruments ?? [];
            const measureList = osmd.graphic?.measureList ?? [];
            const regions = [];
            for (const instrument of instruments) {
                if (!instrument.Visible)
                    continue;
                if (!isBoundedMeasurePartId(instrument.IdString)) {
                    throw new Error("Rendered measure partId is invalid for measure hit-test.");
                }
                const staffIds = instrument.Staves.map((staff) => staff.idInMusicSheet).sort((a, b) => a - b);
                for (let measureIndex = 0; measureIndex < measureList.length; measureIndex += 1) {
                    requireNonNegativeInteger(measureIndex, "measureIndex");
                    const measure = measureList[measureIndex];
                    for (const staffId of staffIds) {
                        const graphicalMeasure = measure?.[staffId];
                        if (graphicalMeasure === undefined)
                            continue;
                        const shape = graphicalMeasure.PositionAndShape;
                        const pageNumber = graphicalMeasure.ParentMusicSystem?.Parent?.PageNumber;
                        if (shape === undefined
                            || !Number.isSafeInteger(pageNumber)
                            || pageNumber < 0) {
                            throw new Error("Rendered graphical measure page identity is unavailable.");
                        }
                        const absoluteX = shape.AbsolutePosition?.x;
                        const absoluteY = shape.AbsolutePosition?.y;
                        const borderLeft = shape.BorderLeft;
                        const borderRight = shape.BorderRight;
                        const borderTop = shape.BorderTop;
                        const borderBottom = shape.BorderBottom;
                        for (const value of [absoluteX, absoluteY, borderLeft, borderRight, borderTop, borderBottom]) {
                            if (!Number.isFinite(value)) {
                                throw new Error("Rendered graphical measure geometry is unavailable.");
                            }
                        }
                        const left = absoluteX + borderLeft;
                        const right = absoluteX + borderRight;
                        const top = absoluteY + borderTop;
                        const bottom = absoluteY + borderBottom;
                        if (!(right > left) || !(bottom > top)) {
                            throw new Error("Rendered graphical measure borders are invalid.");
                        }
                        regions.push(Object.freeze({
                            pageNumber: pageNumber,
                            left,
                            right,
                            top,
                            bottom,
                            target: Object.freeze({ partId: instrument.IdString, measureIndex }),
                        }));
                        if (regions.length > MAX_MEASURE_HIT_REGIONS) {
                            throw new RangeError(`Rendered measure hit-test index exceeds ${MAX_MEASURE_HIT_REGIONS} regions.`);
                        }
                    }
                }
            }
            this.#measureHitRegions = Object.freeze(regions);
            this.#measureGeometryAvailable = true;
        }
        catch {
            this.#measureHitRegions = Object.freeze([]);
            this.#measureGeometryAvailable = false;
        }
    }
    #isInsideContainer(element) {
        let current = element;
        while (current !== null) {
            if (current === this.#container)
                return true;
            current = current.parentElement;
        }
        return false;
    }
    #resolveOwnedSvgPage(pageNumber) {
        if (!Number.isSafeInteger(pageNumber) || pageNumber < 0)
            return undefined;
        const id = `${OSMD_SVG_PAGE_ID_PREFIX}${pageNumber}`;
        const matches = [...this.#container.querySelectorAll(`[id="${id}"]`)];
        if (matches.length !== 1)
            return undefined;
        const page = matches[0];
        return this.#isInsideContainer(page) ? page : undefined;
    }
    #resolveMeasurePage(initial) {
        let current = initial;
        while (current !== null && current !== this.#container) {
            const id = current.id;
            if (typeof id === "string" && id.startsWith(OSMD_SVG_PAGE_ID_PREFIX)) {
                const rawPageNumber = id.slice(OSMD_SVG_PAGE_ID_PREFIX.length);
                if (!/^(0|[1-9][0-9]*)$/.test(rawPageNumber)) {
                    return Object.freeze({ kind: "UNAVAILABLE" });
                }
                const pageNumber = Number(rawPageNumber);
                if (!Number.isSafeInteger(pageNumber))
                    return Object.freeze({ kind: "UNAVAILABLE" });
                const mapped = this.#resolveOwnedSvgPage(pageNumber);
                if (mapped === undefined || mapped !== current) {
                    return Object.freeze({ kind: "UNAVAILABLE" });
                }
                return Object.freeze({ kind: "PAGE", pageNumber });
            }
            current = current.parentElement;
        }
        return Object.freeze({ kind: "UNMAPPED" });
    }
    #projectClientPointToOsmd(pageNumber, point) {
        const svg = this.#resolveOwnedSvgPage(pageNumber);
        const ctm = svg?.getScreenCTM?.();
        const createPoint = svg?.createSVGPoint;
        if (ctm === null || ctm === undefined || typeof ctm.inverse !== "function" || typeof createPoint !== "function") {
            return undefined;
        }
        try {
            const inverse = ctm.inverse();
            const svgPoint = createPoint.call(svg);
            svgPoint.x = point.clientX;
            svgPoint.y = point.clientY;
            const local = svgPoint.matrixTransform(inverse);
            if (!Number.isFinite(local.x) || !Number.isFinite(local.y))
                return undefined;
            const x = local.x / OSMD_SVG_UNITS_PER_UNIT;
            const y = local.y / OSMD_SVG_UNITS_PER_UNIT;
            if (!Number.isFinite(x) || !Number.isFinite(y))
                return undefined;
            return Object.freeze({ x, y });
        }
        catch {
            return undefined;
        }
    }
    #registerHitTestElement(element, owner) {
        if (!this.#noteRefByElement.has(element)) {
            this.#noteRefByElement.set(element, owner);
            return;
        }
        const previous = this.#noteRefByElement.get(element);
        if (previous === undefined || previous === AMBIGUOUS_HIT_OWNER)
            return;
        if (owner === AMBIGUOUS_HIT_OWNER) {
            this.#noteRefByElement.set(element, AMBIGUOUS_HIT_OWNER);
            return;
        }
        if (previous === NO_NOTE_HIT_OWNER && owner === NO_NOTE_HIT_OWNER)
            return;
        if (isScoreNoteRefOwner(previous) && isScoreNoteRefOwner(owner) && sameScoreNoteRef(previous, owner))
            return;
        this.#noteRefByElement.set(element, AMBIGUOUS_HIT_OWNER);
    }
    #registerRenderedEventHitTestElement(element, owner) {
        if (!this.#renderedEventRefByElement.has(element)) {
            this.#renderedEventRefByElement.set(element, owner);
            return;
        }
        const previous = this.#renderedEventRefByElement.get(element);
        if (previous === undefined || previous === AMBIGUOUS_HIT_OWNER)
            return;
        if (owner === AMBIGUOUS_HIT_OWNER) {
            this.#renderedEventRefByElement.set(element, AMBIGUOUS_HIT_OWNER);
            return;
        }
        if (isRenderedEventRefOwner(previous) && isRenderedEventRefOwner(owner) && sameRenderedEventTargetRef(previous, owner))
            return;
        this.#renderedEventRefByElement.set(element, AMBIGUOUS_HIT_OWNER);
    }
    #resetHitTestIndex() {
        this.#noteRefByElement = new WeakMap();
        this.#renderedEventRefByElement = new WeakMap();
        this.#measureHitRegions = Object.freeze([]);
        this.#measureGeometryAvailable = false;
    }
    #ensureHighlightStyle() {
        if (this.#container.querySelector("style[data-st-score-highlight-style]") !== null)
            return;
        const document = this.#container.ownerDocument;
        const style = document.createElement("style");
        style.setAttribute("data-st-score-highlight-style", "true");
        style.textContent = '[data-st-score-highlight="true"] { fill: #ff8c00 !important; stroke: #ff8c00 !important; } [data-st-score-highlight="true"] * { fill: #ff8c00 !important; stroke: #ff8c00 !important; }';
        this.#container.prepend(style);
    }
}
//# sourceMappingURL=index.js.map