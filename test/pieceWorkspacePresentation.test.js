import test from 'node:test';
import assert from 'node:assert/strict';
import { createPieceWorkspacePresentation } from '../src/ui/pieceWorkspacePresentation.js';

function fixture() {
  const attrs = new Map();
  const button = { textContent: 'Odak', setAttribute: (key, value) => attrs.set('button:' + key, value) };
  const workspace = { setAttribute: (key, value) => attrs.set(key, value), querySelector: () => button };
  let panel = { scrollTop: 0, scrollLeft: 0 };
  const note = { open: true };
  const output = { textContent: '' };
  const decrease = {};
  const increase = {};
  const sizeStyle = new Map();
  const root = { querySelector: selector => {
    if (selector === '.piece-workspace') return workspace;
    if (selector === '.piece-teacher-note') return note;
    if (selector === '[data-piece-notation-size]') return output;
    if (selector === '[data-action="decrease-piece-notation"]') return decrease;
    if (selector === '[data-action="increase-piece-notation"]') return increase;
    if (selector === '.piece-score-panel:not([hidden])') return { style: { setProperty: (k, v) => sizeStyle.set(k, v) } };
    return panel;
  } };
  const state = (id = 'piece-a', selectedView = 'SCORE') => ({ screen: 'piece_workspace', pieceWorkspace: { pieceAssignmentId: id, selectedView } });
  return { root, attrs, button, state, note, output, decrease, increase, sizeStyle, get panel() { return panel; }, replacePanel() { panel = { scrollTop: 0, scrollLeft: 0 }; } };
}

test('focus keeps the active piece and panel in place and resets on leaving it', () => {
  const f = fixture();
  const view = createPieceWorkspacePresentation(f.root);
  view.synchronize(f.state());
  const panel = f.panel;
  view.toggle();
  assert.equal(f.attrs.get('data-focus-mode'), 'true');
  assert.equal(f.button.textContent, 'Odaktan çık');
  assert.equal(f.panel, panel);
  view.synchronize(f.state('piece-a', 'CHORDS'));
  assert.equal(f.attrs.get('data-focus-mode'), 'true');
  view.synchronize({ screen: 'my_work' });
  view.synchronize(f.state());
  assert.equal(f.attrs.get('data-focus-mode'), 'false');
  assert.equal(f.button.textContent, 'Odak');
});

test('notation size stays local to each view, survives repaint and focus, and resets on leaving', () => {
  const f = fixture();
  const view = createPieceWorkspacePresentation(f.root);
  view.synchronize(f.state());
  for (let i = 0; i < 8; i++) view.resizeNotation('increase-piece-notation');
  assert.equal(f.output.textContent, '150%');
  assert.equal(f.increase.disabled, true);
  assert.equal(f.sizeStyle.get('--piece-notation-width'), '150%');
  view.toggle();
  view.synchronize(f.state());
  assert.equal(f.output.textContent, '150%');
  view.synchronize(f.state('piece-a', 'TAB'));
  assert.equal(f.output.textContent, '100%');
  for (let i = 0; i < 8; i++) view.resizeNotation('decrease-piece-notation');
  assert.equal(f.output.textContent, '60%');
  assert.equal(f.decrease.disabled, true);
  view.synchronize(f.state());
  assert.equal(f.output.textContent, '150%');
  view.resizeNotation('fit-piece-notation');
  assert.equal(f.output.textContent, '100%');
  view.synchronize({ screen: 'my_work' });
  view.synchronize(f.state('piece-a', 'TAB'));
  assert.equal(f.output.textContent, '100%');
});

test('teacher note visibility survives a control repaint and remains independent of focus', () => {
  const f = fixture();
  const view = createPieceWorkspacePresentation(f.root);
  view.synchronize(f.state());
  f.note.open = false;
  view.captureScroll();
  view.synchronize(f.state());
  view.toggle();
  assert.equal(f.note.open, false);
  view.synchronize(f.state('piece-a', 'CHORDS'));
  assert.equal(f.note.open, false);
  view.synchronize(f.state('piece-b'));
  assert.equal(f.note.open, true);
});

test('score scroll survives a control repaint and is isolated from chord scroll and other pieces', () => {
  const f = fixture();
  const view = createPieceWorkspacePresentation(f.root);
  view.synchronize(f.state());
  f.panel.scrollTop = 240;
  f.panel.scrollLeft = 12;
  view.captureScroll();
  f.replacePanel();
  view.synchronize(f.state());
  assert.deepEqual(f.panel, { scrollTop: 240, scrollLeft: 12 });
  view.synchronize(f.state('piece-a', 'CHORDS'));
  f.panel.scrollTop = 60;
  view.captureScroll();
  f.replacePanel();
  view.synchronize(f.state());
  assert.equal(f.panel.scrollTop, 240);
  view.synchronize(f.state('piece-b'));
  f.replacePanel();
  view.synchronize(f.state('piece-a'));
  assert.equal(f.panel.scrollTop, 0);
});
