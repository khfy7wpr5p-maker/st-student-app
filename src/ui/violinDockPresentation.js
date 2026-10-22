// Layout only. Musical state continues to belong to the existing follow ports.
const COMPACT_QUERY = '(max-width: 640px), (max-height: 560px) and (max-width: 1024px)';

export function createViolinDockPresentation({ root } = {}) {
  const win = root?.ownerDocument?.defaultView;
  let dock = null, workspace = null, score = null, host = null;
  let resize = null, mutation = null, frame = null, key = null;
  let detailOpen = false, followPending = false, disposed = false;

  function setDetail(open, focus = false) {
    detailOpen = open;
    const detail = root?.querySelector?.('[data-violin-detail]');
    const button = root?.querySelector?.('[data-action="toggle-violin-detail"]');
    if (detail) detail.hidden = !open;
    button?.setAttribute?.('aria-expanded', String(open));
    if (focus) {
      const target = open ? detail?.querySelector?.('[data-action="close-violin-detail"]') : button;
      target?.focus?.({ preventScroll: true });
    }
  }

  function update() {
    frame = null;
    if (disposed || !dock) return;
    const follow = followPending;
    followPending = false;
    if (win?.matchMedia?.(COMPACT_QUERY)?.matches !== true) {
      workspace?.style?.removeProperty('--violin-dock-height');
      dock.style.bottom = '';
      setDetail(false);
      return;
    }
    const viewport = win.visualViewport;
    const bottomInset = viewport && viewport.scale === 1
      ? Math.max(0, win.innerHeight - viewport.height - viewport.offsetTop) : 0;
    const bottom = `${bottomInset}px`;
    if (dock.style.bottom !== bottom) dock.style.bottom = bottom;
    const bounds = dock.getBoundingClientRect();
    if (Number.isFinite(bounds.height) && bounds.height > 0) {
      workspace?.style?.setProperty('--violin-dock-height', `${Math.ceil(bounds.height + bottomInset)}px`);
    }
    // Geometry determines visibility only; never derive pitch or event identity here.
    if (!follow || detailOpen || viewport?.scale > 1 || !host?.querySelector?.('[data-playing="true"]')) return;
    const cursor = score?.querySelector?.('img[id^="cursorImg-"]');
    const active = cursor?.getBoundingClientRect?.();
    if (!active || active.height <= 0) return;
    const top = (viewport?.offsetTop ?? 0) + 8;
    const bottomEdge = bounds.top - 8;
    if (bottomEdge <= top) return;
    const delta = active.height > bottomEdge - top || active.top < top
      ? active.top - top : active.bottom > bottomEdge ? active.bottom - bottomEdge : 0;
    if (Math.abs(delta) > 1) win?.scrollBy?.({ top: delta, behavior: 'instant' });
  }

  function schedule(follow = false) {
    if (disposed || !dock) return;
    followPending ||= follow;
    if (frame !== null) return;
    if (typeof win?.requestAnimationFrame === 'function') frame = win.requestAnimationFrame(update);
    else update();
  }
  const resized = () => schedule(true);
  const viewportScrolled = () => schedule(false);
  const escaped = event => {
    if (event.key === 'Escape' && detailOpen) { event.preventDefault?.(); setDetail(false, true); }
  };

  function disconnect() {
    resize?.disconnect(); mutation?.disconnect();
    resize = mutation = null;
    if (frame !== null) win?.cancelAnimationFrame?.(frame);
    frame = null; followPending = false;
    workspace?.style?.removeProperty('--violin-dock-height');
    if (dock?.style) dock.style.bottom = '';
    win?.removeEventListener?.('resize', resized);
    win?.visualViewport?.removeEventListener?.('resize', resized);
    win?.visualViewport?.removeEventListener?.('scroll', viewportScrolled);
    root?.removeEventListener?.('keydown', escaped);
    dock = workspace = score = host = null;
  }

  return Object.freeze({
    synchronize(nextKey) {
      if (disposed) return;
      if (nextKey !== key) { detailOpen = false; key = nextKey; }
      const nextDock = root?.querySelector?.('[data-violin-dock]') ?? null;
      if (nextDock !== dock) {
        disconnect(); dock = nextDock;
        workspace = root?.querySelector?.('.piece-workspace') ?? null;
        score = root?.querySelector?.('#st-score-root') ?? null;
        host = root?.querySelector?.('[data-violin-fingerboard]') ?? null;
        if (dock) {
          win?.addEventListener?.('resize', resized);
          win?.visualViewport?.addEventListener?.('resize', resized);
          win?.visualViewport?.addEventListener?.('scroll', viewportScrolled);
          root?.addEventListener?.('keydown', escaped);
          resize = typeof win?.ResizeObserver === 'function' ? new win.ResizeObserver(resized) : null;
          resize?.observe(dock);
          mutation = typeof win?.MutationObserver === 'function' ? new win.MutationObserver(() => schedule(true)) : null;
          if (score) mutation?.observe(score, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'data-st-score-highlight'] });
          if (host) mutation?.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-playing'] });
        }
      }
      setDetail(detailOpen);
      schedule(true);
    },
    toggleDetail() { if (dock) setDetail(!detailOpen, true); },
    closeDetail() { setDetail(false, true); },
    dispose() {
      disposed = true; disconnect();
      win?.removeEventListener?.('resize', resized);
      win?.visualViewport?.removeEventListener?.('resize', resized);
      win?.visualViewport?.removeEventListener?.('scroll', viewportScrolled);
      root?.removeEventListener?.('keydown', escaped);
    },
  });
}
