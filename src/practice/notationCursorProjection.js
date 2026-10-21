// Presentation bridge for OSMD's HTML cursor and its separately sized SVG.
import { ensureNotationViewBoxes } from './notationViewport.js';

export function createNotationCursorProjection(root) {
  const window = root?.ownerDocument?.defaultView;
  const owned = new Map();
  let frame = null;
  let disposed = false;

  function restore(cursor, original) {
    if (cursor.style.transform !== original.transform) cursor.style.transform = original.transform;
    if (cursor.style.transformOrigin !== original.origin) cursor.style.transformOrigin = original.origin;
    original.projected = null;
    original.applied = null;
  }

  function project(cursor) {
    const svg = cursor.parentElement?.querySelector?.('svg');
    const parent = cursor.offsetParent;
    const matrix = svg?.getScreenCTM?.();
    const bounds = parent?.getBoundingClientRect?.();
    const left = Number.parseFloat(cursor.style.left);
    const top = Number.parseFloat(cursor.style.top);
    if (!matrix || !bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    // The score page is axis aligned. Do not guess if an external transform
    // introduces rotation, reflection, or geometry the renderer cannot expose.
    if (matrix.b !== 0 || matrix.c !== 0) return null;
    const a = matrix.a;
    const d = matrix.d;
    const x = matrix.e - bounds.left - parent.clientLeft + parent.scrollLeft;
    const y = matrix.f - bounds.top - parent.clientTop + parent.scrollTop;
    // OSMD retains native left/top/width/height. Apply only the difference
    // between that HTML rectangle and its SVG viewport projection, including
    // a cropped viewBox's translated origin. Never feed projected values back.
    const values = [a, 0, 0, d, x + (a - 1) * left, y + (d - 1) * top];
    if (a <= 0 || d <= 0 || !values.every(Number.isFinite)) return null;
    return `matrix(${values.join(',')})`;
  }

  function update() {
    frame = null;
    if (disposed) return;
    // OSMD can replace its SVG during autoResize, bypassing the initial mount.
    ensureNotationViewBoxes(root);
    const cursors = new Set(root?.querySelectorAll?.('img[id^="cursorImg-"]') ?? []);
    for (const [cursor, original] of owned) {
      if (!cursors.has(cursor)) { restore(cursor, original); owned.delete(cursor); }
    }
    for (const cursor of cursors) {
      if (!owned.has(cursor)) {
        // Other presentation owners must keep their own transforms.
        if (cursor.style.transform) continue;
        owned.set(cursor, { transform: cursor.style.transform, origin: cursor.style.transformOrigin });
      }
      let transform = null;
      try { transform = project(cursor); } catch { /* Unavailable layout leaves native cursor geometry intact. */ }
      if (transform === null) { restore(cursor, owned.get(cursor)); continue; }
      if (cursor.style.transformOrigin !== '0px 0px') cursor.style.transformOrigin = '0px 0px';
      const state = owned.get(cursor);
      // CSSOM may normalize whitespace and numeric precision. Compare the last
      // requested matrix as well as its serialized value, avoiding observer loops.
      if (state.projected !== transform || cursor.style.transform !== state.applied) {
        cursor.style.transform = transform;
        state.projected = transform;
        state.applied = cursor.style.transform;
      }
    }
  }

  function refresh() {
    if (disposed || frame !== null) return;
    if (typeof window?.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(update);
    else update();
  }

  const mutation = typeof window?.MutationObserver === 'function' ? new window.MutationObserver(refresh) : null;
  mutation?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'width', 'height', 'viewBox', 'preserveAspectRatio'] });
  const resize = typeof window?.ResizeObserver === 'function' ? new window.ResizeObserver(refresh) : null;
  resize?.observe(root);
  refresh();

  return Object.freeze({
    refresh,
    dispose() {
      disposed = true;
      mutation?.disconnect();
      resize?.disconnect();
      if (frame !== null) window?.cancelAnimationFrame?.(frame);
      frame = null;
      for (const [cursor, original] of owned) restore(cursor, original);
      owned.clear();
    },
  });
}
