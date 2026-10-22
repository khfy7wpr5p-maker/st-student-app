import test from 'node:test';
import assert from 'node:assert/strict';
import { createViolinDockPresentation } from '../src/ui/violinDockPresentation.js';

function fixture() {
  const props = new Map(), frames = new Map(), observers = [], scrolls = [];
  let next = 0, compact = true, playing = true, dockHeight = 220;
  const listeners = new Map();
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const button = { setAttribute(k,v) { this[k] = v; }, focus() { this.focused = true; } };
  const close = { focus() { this.focused = true; } };
  const detail = { hidden: true, querySelector: () => close };
  const style = { setProperty: (k,v) => props.set(k,v), removeProperty: k => props.delete(k) };
  const cursor = { getBoundingClientRect: () => ({ top: 420, bottom: 540, height: 120 }) };
  const score = { querySelector: () => cursor };
  const host = { querySelector: () => playing ? {} : null };
  const dock = { style: {}, getBoundingClientRect: () => ({ top: 500, height: dockHeight }) };
  const workspace = { style };
  const viewport = { height: 720, offsetTop: 0, scale: 1, addEventListener() {}, removeEventListener() {} };
  const win = {
    innerHeight: 720, visualViewport: viewport,
    matchMedia: () => ({ matches: compact }),
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: Observer, MutationObserver: Observer,
    addEventListener: (k,v) => listeners.set(k,v), removeEventListener: k => listeners.delete(k),
    scrollBy: options => scrolls.push(options),
  };
  const root = { ownerDocument: { defaultView: win }, addEventListener() {}, removeEventListener() {}, querySelector(s) {
    return { '[data-violin-dock]': dock, '.piece-workspace': workspace, '#st-score-root': score, '[data-violin-fingerboard]': host, '[data-violin-detail]': detail, '[data-action="toggle-violin-detail"]': button }[s] ?? null;
  } };
  return { root, props, observers, scrolls, button, close, detail, listeners, viewport, dock,
    setPlaying: v => playing=v, setCompact: v => compact=v, setHeight: v => dockHeight=v,
    flush() { const pending=[...frames.values()]; frames.clear(); for(const fn of pending) fn(); }, frames };
}

test('dock reserves its measured height and adapts to keyboard visual viewport', () => {
  const f=fixture(), p=createViolinDockPresentation({root:f.root});
  p.synchronize('piece-a'); f.flush();
  assert.equal(f.props.get('--violin-dock-height'), '220px');
  f.setHeight(260); f.viewport.height=450;
  f.observers[0].callback(); f.flush();
  assert.equal(f.props.get('--violin-dock-height'), '530px'); // 260px dock + 270px keyboard obstruction.
  assert.equal(f.dock.style.bottom, '270px');
  p.dispose();
});

test('details keep independent DOM state and restore focus without moving playback or scroll', () => {
  const f=fixture(), p=createViolinDockPresentation({root:f.root});
  p.synchronize('piece-a'); f.flush(); f.scrolls.length=0;
  p.toggleDetail();
  assert.equal(f.detail.hidden,false); assert.equal(f.button['aria-expanded'],'true');
  assert.equal(f.close.focused,true); assert.equal(f.scrolls.length,0);
  p.synchronize('piece-a'); f.flush();
  assert.equal(f.detail.hidden,false);
  p.closeDetail(); assert.equal(f.detail.hidden,true); assert.equal(f.button.focused,true);
  p.toggleDetail(); p.synchronize('piece-b'); f.flush(); assert.equal(f.detail.hidden,true);
  p.dispose();
});

test('playing cursor is kept above dock; paused state never forces document scroll', () => {
  const f=fixture(), p=createViolinDockPresentation({root:f.root});
  p.synchronize('piece-a'); f.flush();
  assert.ok(f.scrolls.some(s=>s.top===48 && s.behavior==='instant'));
  f.scrolls.length=0; f.setPlaying(false);
  for(const observer of f.observers) observer.callback(); f.flush();
  assert.equal(f.scrolls.length,0);
  p.dispose();
});

test('desktop and disposal release observers, frame and layout reservation', () => {
  const f=fixture(), p=createViolinDockPresentation({root:f.root});
  p.synchronize('piece-a'); f.flush();
  f.setCompact(false); f.listeners.get('resize')(); f.flush();
  assert.equal(f.props.has('--violin-dock-height'),false);
  assert.equal(f.detail.hidden,true);
  p.dispose();
  assert.ok(f.observers.every(o=>o.disconnected)); assert.equal(f.frames.size,0);
});
