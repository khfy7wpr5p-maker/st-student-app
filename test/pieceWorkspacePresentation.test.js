import test from 'node:test';
import assert from 'node:assert/strict';
import { createPieceWorkspacePresentation } from '../src/ui/pieceWorkspacePresentation.js';

function fixture() {
  const attrs = new Map();
  const button = { textContent: 'Odak', setAttribute: (key, value) => attrs.set('button:' + key, value) };
  const workspace = { setAttribute: (key, value) => attrs.set(key, value), querySelector: () => button };
  let panel = { scrollTop: 0, scrollLeft: 0 };
  const root = { querySelector: selector => selector === '.piece-workspace' ? workspace : panel };
  const state = (id = 'piece-a', selectedView = 'SCORE') => ({ screen: 'piece_workspace', pieceWorkspace: { pieceAssignmentId: id, selectedView } });
  return { root, attrs, button, state, get panel() { return panel; }, replacePanel() { panel = { scrollTop: 0, scrollLeft: 0 }; } };
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
