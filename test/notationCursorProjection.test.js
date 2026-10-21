import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotationCursorProjection } from '../src/practice/notationCursorProjection.js';

function fixture() {
  const frames = new Map();
  const observers = [];
  let nextFrame = 0;
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const window = {
    MutationObserver: Observer, ResizeObserver: Observer,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  let matrix = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
  const svg = { getScreenCTM: () => matrix };
  const page = {
    offsetWidth: 390, offsetHeight: 800, clientLeft: 0, clientTop: 0,
    scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 390, height: 800 }),
    querySelector: () => svg,
  };
  function makeCursor() {
    return {
      parentElement: page, offsetParent: page,
      style: { left: '180px', top: '120px', transform: '', transformOrigin: '' },
      width: 30, height: 140,
    };
  }
  let cursor = makeCursor();
  const root = { ownerDocument: { defaultView: window }, querySelectorAll: () => [cursor] };
  return {
    root, page, svg, observers, frames, get cursor() { return cursor; },
    setMatrix(value) { matrix = value; },
    replaceCursor() { cursor = makeCursor(); },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
  };
}

// Apply the CSS matrix to the native image rectangle, independently of the bridge.
function paintedBox(f) {
  const { style, width, height } = f.cursor;
  const numbers = style.transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
  assert.ok(numbers, 'cursor needs an SVG-to-HTML projection');
  const [a, b, c, d, e, g] = numbers;
  assert.equal(b, 0); assert.equal(c, 0);
  return { left: 10 + Number.parseFloat(style.left) + e, top: 20 + Number.parseFloat(style.top) + g, width: width * a, height: height * d };
}

test('held cursor follows 60%, 100%, 150% SVG geometry, including cropped viewBox origin', () => {
  const f = fixture();
  const bridge = createNotationCursorProjection(f.root);
  for (const [scale, expected] of [
    [0.6, { left: 130, top: 62, width: 18, height: 84 }],
    [1, { left: 202, top: 110, width: 30, height: 140 }],
    [1.5, { left: 292, top: 170, width: 45, height: 210 }],
    [1, { left: 202, top: 110, width: 30, height: 140 }],
  ]) {
    f.setMatrix({ a: scale, b: 0, c: 0, d: scale, e: 22, f: -10 });
    bridge.refresh(); f.flush();
    assert.deepEqual(paintedBox(f), expected);
    assert.equal(f.cursor.style.left, '180px');
    assert.equal(f.cursor.style.top, '120px');
    assert.equal(f.cursor.width, 30); assert.equal(f.cursor.height, 140);
  }
  bridge.dispose();
});

test('native cursor movement and replaced renderer pages are projected without compounding', () => {
  const f = fixture();
  const bridge = createNotationCursorProjection(f.root);
  f.setMatrix({ a: 1.5, b: 0, c: 0, d: 1.5, e: 22, f: -10 });
  bridge.refresh(); f.flush();
  f.cursor.style.left = '200px';
  f.observers[0].callback([]); f.flush();
  assert.deepEqual(paintedBox(f), { left: 322, top: 170, width: 45, height: 210 });
  const oldCursor = f.cursor;
  f.replaceCursor();
  f.observers[0].callback([]); f.flush();
  assert.equal(oldCursor.style.transform, '');
  assert.deepEqual(paintedBox(f), { left: 292, top: 170, width: 45, height: 210 });
  const transform = f.cursor.style.transform;
  bridge.refresh(); f.flush();
  assert.equal(f.cursor.style.transform, transform);
  bridge.dispose();
});

test('unavailable geometry removes stale projection; dispose restores owned styles and cancels work', () => {
  const f = fixture();
  const bridge = createNotationCursorProjection(f.root);
  bridge.refresh(); f.flush();
  assert.match(f.cursor.style.transform, /^matrix/);
  f.setMatrix(null);
  bridge.refresh(); f.flush();
  assert.equal(f.cursor.style.transform, '');
  bridge.refresh();
  bridge.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.cursor.style.transformOrigin, '');
  assert.ok(f.observers.every(observer => observer.disconnected));
  bridge.refresh();
  assert.equal(f.frames.size, 0);
});

test('CSS serialization and repeated observer notifications do not cause repeated style writes', () => {
  const f = fixture();
  let stored = '';
  let writes = 0;
  Object.defineProperty(f.cursor.style, 'transform', {
    get() { return stored; },
    set(value) { writes += 1; stored = value.replaceAll(',', ', '); },
  });
  const bridge = createNotationCursorProjection(f.root);
  f.flush();
  assert.equal(writes, 1);
  for (let i = 0; i < 5; i++) { f.observers[0].callback([]); f.observers[1].callback([]); f.flush(); }
  assert.equal(writes, 1, 'no mutation-observer feedback loop');
  bridge.dispose();
});
