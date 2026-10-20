// Local view state only: never dispatches a domain action or redraws notation.
export function createPieceWorkspacePresentation(root) {
  let pieceId = null;
  let focusMode = false;
  let activeView = null;
  const scrollPositions = new Map();

  function scrollPanel() {
    return root.querySelector?.('.piece-score-panel:not([hidden]) .practice-notation') ??
      root.querySelector?.('.piece-chords-panel:not([hidden])') ?? null;
  }

  function captureScroll() {
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
  }

  function synchronize(state) {
    const nextId = state.screen === 'piece_workspace' ? state.pieceWorkspace?.pieceAssignmentId ?? null : null;
    if (nextId !== pieceId) {
      pieceId = nextId;
      focusMode = false;
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
    toggle() {
      if (pieceId === null) return;
      focusMode = !focusMode;
      apply();
    },
  });
}
