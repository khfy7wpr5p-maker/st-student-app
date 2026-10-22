import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { renderPracticeWorkspace } from '../src/ui/renderPracticeWorkspace.js';
import { createViolinFingerboardPresentation } from '../src/ui/violinFingerboard.js';

const practice = {
  title: 'Keman etüdü',
  capabilities: { notation: 'AVAILABLE', violin: 'AVAILABLE', playback: 'AVAILABLE' },
  practice: { tempoBpm: 60 },
};

test('compact violin and unchanged transport share a dock outside the score root', () => {
  const html = renderPracticeWorkspace(practice, { compactViolin: true });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sections = Array.from(doc.getElementsByTagName('section'));
  const dock = sections.find(e => e.hasAttribute('data-violin-dock'));
  assert.ok(dock, 'a shared dock is required');
  const violin = sections.find(e => e.getAttribute('class')?.includes('practice-violin'));
  const transport = sections.find(e => e.getAttribute('class')?.includes('practice-playback'));
  assert.equal(violin.parentNode, dock);
  assert.equal(transport.parentNode, dock);
  assert.match(html, /aria-controls="violin-detail"/);
  assert.match(html, /data-action="play-practice"/);
  assert.match(html, /data-action="pause-practice"/);
  assert.match(html, /data-action="restart-practice"/);
});

test('non-violin and TAB keep their existing transport and have no compact dock', () => {
  for (const options of [{ compactViolin: true, notationHeading: 'TAB' }, { compactViolin: false }]) {
    assert.doesNotMatch(renderPracticeWorkspace(practice, options), /data-violin-dock/);
  }
  assert.doesNotMatch(renderPracticeWorkspace({ ...practice, capabilities: { ...practice.capabilities, violin: 'UNAVAILABLE' } }, { compactViolin: true }), /data-violin-dock/);
});

test('open E has an explicit zero badge and detail receives the same snapshot and clears', () => {
  const compact = { innerHTML: '' }, detail = { innerHTML: '' };
  const root = { querySelector: s => s === '[data-violin-fingerboard]' ? compact : s === '[data-violin-detail-state]' ? detail : null };
  const view = createViolinFingerboardPresentation({ root });
  view.show({ state: 'AVAILABLE', playing: true, pitch: { step: 'E', octave: 5 }, primary: { stringId: 'E', finger: 0, placement: 'OPEN', normalizedPosition: 0 } });
  assert.match(compact.innerHTML, /Mi · Açık Mi teli · 0/);
  assert.match(detail.innerHTML, /data-active-string="E"/);
  assert.doesNotMatch(compact.innerHTML, /class="violin-stop-marker"/);
  view.clear();
  assert.doesNotMatch(detail.innerHTML, /data-active-string/);
});
