// Local view state only: never dispatches a domain action or redraws notation.
// Scale the SVG viewport, not the page or the renderer's musical identities.
import { createNotationCursorProjection } from '../practice/notationCursorProjection.js';

export function createPieceWorkspacePresentation(root) {
  let pieceId = null;
  let focusMode = false;
  let activeView = null;
  let noteOpen = true;
  const notationSizes = new Map();
  const scrollPositions = new Map();
  let cursorRoot = null;
  let cursorProjection = null;

  function scrollPanel() {
    return root.querySelector?.('.piece-score-panel:not([hidden]) .practice-notation') ??
      root.querySelector?.('.piece-chords-panel:not([hidden])') ?? null;
  }

  function captureScroll() {
    const note = root.querySelector?.('.piece-teacher-note');
    if (typeof note?.open === 'boolean') noteOpen = note.open;
    const panel = scrollPanel();
    if (panel && activeView) {
      scrollPositions.set(activeView, { top: panel.scrollTop, left: panel.scrollLeft });
    }
  }

  function apply() {
    const workspace = root.querySelector?.('.piece-workspace');
    if (!workspace) return;
    workspace.setAttribute('data-focus-mode', String(focusMode));
    const button = workspace.querySelector?.('[data-action="toggle-piece-focus"]');
    if (button) {
      button.setAttribute('aria-pressed', String(focusMode));
      button.textContent = focusMode ? 'Odaktan çık' : 'Odak';
    }
    const note = root.querySelector?.('.piece-teacher-note');
    if (note) note.open = noteOpen;
    applyNotationSize();
  }

  function applyNotationSize() {
    const size = notationSizes.get(activeView) ?? 100;
    const panel = root.querySelector?.('.piece-score-panel:not([hidden])');
    panel?.style?.setProperty('--piece-notation-width', `${size}%`);
    const nextCursorRoot = panel?.querySelector?.('#st-score-root') ?? null;
    if (nextCursorRoot !== cursorRoot) {
      cursorProjection?.dispose();
      cursorRoot = nextCursorRoot;
      cursorProjection = cursorRoot ? createNotationCursorProjection(cursorRoot) : null;
    }
    cursorProjection?.refresh();
    const output = root.querySelector?.('[data-piece-notation-size]');
    if (output) output.textContent = `${size}%`;
    const decrease = root.querySelector?.('[data-action="decrease-piece-notation"]');
    const increase = root.querySelector?.('[data-action="increase-piece-notation"]');
    if (decrease) decrease.disabled = size <= 60;
    if (increase) increase.disabled = size >= 150;
  }

  function synchronize(state) {
    const nextId = state.screen === 'piece_workspace' ? state.pieceWorkspace?.pieceAssignmentId ?? null : null;
    if (nextId !== pieceId) {
      pieceId = nextId;
      focusMode = false;
      noteOpen = true;
      notationSizes.clear();
      scrollPositions.clear();
    }
    activeView = pieceId === null ? null : state.pieceWorkspace?.selectedView;
    apply();
    const position = scrollPositions.get(activeView);
    const panel = scrollPanel();
    if (panel && position) {
      panel.scrollTop = position.top;
      panel.scrollLeft = position.left;
    }
  }

  return Object.freeze({
    captureScroll,
    synchronize,
    dispose() {
      cursorProjection?.dispose();
      cursorProjection = null;
      cursorRoot = null;
    },
    resizeNotation(action) {
      if (pieceId === null || !['SCORE', 'TAB'].includes(activeView)) return;
      const size = notationSizes.get(activeView) ?? 100;
      const nextSize = action === 'fit-piece-notation' ? 100 :
        action === 'increase-piece-notation' ? Math.min(150, size + 10) :
        action === 'decrease-piece-notation' ? Math.max(60, size - 10) : size;
      notationSizes.set(activeView, nextSize);
      applyNotationSize();
    },
    toggle() {
      if (pieceId === null) return;
      captureScroll();
      focusMode = !focusMode;
      apply();
    },
  });
}
