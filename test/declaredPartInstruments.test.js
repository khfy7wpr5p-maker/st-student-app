import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { resolvePlaybackPartInstruments } from '../src/playback/playbackPartRouting.js';

globalThis.DOMParser = DOMParser;
const programs = { GRAND_PIANO: 1, CLASSICAL_GUITAR: 25, VIOLIN: 41 };
const marker = '<identification><miscellaneous><miscellaneous-field name="seslitab-part-instruments-version">1</miscellaneous-field></miscellaneous></identification>';
function fixture(instruments, { ids = instruments.map((_, i) => 'part-' + i), marked = true, reverseBodies = false } = {}) {
  const entries = instruments.map((id, i) => `<score-part id="${ids[i]}"><part-name>Voice</part-name><score-instrument id="I${i}"><instrument-name>Voice</instrument-name></score-instrument><midi-instrument id="I${i}"><midi-channel>${i + 1}</midi-channel><midi-program>${programs[id]}</midi-program></midi-instrument></score-part>`);
  const bodies = ids.map((id, i) => `<part id="${id}"><measure number="1"><note><instrument id="I${i}"/><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>`);
  if (reverseBodies) bodies.reverse();
  return { pkg: { playbackInstrument: instruments.includes('VIOLIN') ? 'VIOLIN' : instruments[0], content: { score: { data: `<score-partwise>${marked ? marker : ''}<part-list>${entries.join('')}</part-list>${bodies.join('')}</score-partwise>` }, ...(instruments.includes('VIOLIN') ? { violin: { schemaVersion: 1, position: 1, targetPartId: ids[instruments.indexOf('VIOLIN')] } } : {}) } }, plan: { notes: ids.map(partId => ({ partId })) }, ids };
}

for (const a of Object.keys(programs)) for (const b of Object.keys(programs)) {
  test(`explicit derived XML routes ${a} with ${b} by part identity`, () => {
    const { pkg, plan, ids } = fixture([a, b]);
    assert.deepEqual({ ...resolvePlaybackPartInstruments(pkg, plan) }, { [ids[0]]: a, [ids[1]]: b });
  });
}

test('marked part identities survive reversed body order and unrelated display names', () => {
  const { pkg, plan } = fixture(['CLASSICAL_GUITAR', 'VIOLIN', 'GRAND_PIANO'], { ids: ['Violin-name', 'Piano-name', 'Guitar-name'], reverseBodies: true });
  assert.deepEqual({ ...resolvePlaybackPartInstruments(pkg, plan) }, { 'Violin-name': 'CLASSICAL_GUITAR', 'Piano-name': 'VIOLIN', 'Guitar-name': 'GRAND_PIANO' });
});

test('unmarked non-violin scores preserve uniform legacy instrument selection', () => {
  const { pkg, plan } = fixture(['GRAND_PIANO', 'CLASSICAL_GUITAR'], { marked: false });
  assert.equal(resolvePlaybackPartInstruments(pkg, plan), null);
});

for (const [label, replace] of [
  ['unknown version', s => s.replace('version">1<', 'version">2<')],
  ['duplicate marker', s => s.replace(marker, marker + marker)],
  ['undeclared instrument', s => s.replace('instrument id="I0"/>', 'instrument id="unknown"/>')],
  ['unknown program', s => s.replace('<midi-program>25</midi-program>', '<midi-program>74</midi-program>')],
  ['percussion channel', s => s.replace('<midi-channel>1</midi-channel>', '<midi-channel>10</midi-channel>')],
  ['non-GM bank', s => s.replace('<midi-program>25', '<midi-bank>2</midi-bank><midi-program>25')],
  ['mid-score change', s => s.replace('</measure>', '<sound><midi-instrument id="I0"><midi-program>1</midi-program></midi-instrument></sound></measure>')],
  ['duplicate part', s => s.replace('id="part-1"', 'id="part-0"')],
  ['duplicate global instrument IDs', s => s.replaceAll('I1', 'I0')],
]) test(`marked XML rejects ${label} instead of falling back to uniform audio`, () => {
  const { pkg, plan } = fixture(['CLASSICAL_GUITAR', 'GRAND_PIANO']);
  pkg.content.score.data = replace(pkg.content.score.data);
  assert.throws(() => resolvePlaybackPartInstruments(pkg, plan));
});

test('a marked violin map requires an exact violin follow target and matching package selection', () => {
  for (const change of [p => delete p.content.violin, p => { p.content.violin.targetPartId = 'part-1'; }, p => { p.playbackInstrument = 'GRAND_PIANO'; }]) {
    const { pkg, plan } = fixture(['VIOLIN', 'GRAND_PIANO']);change(pkg);
    assert.throws(() => resolvePlaybackPartInstruments(pkg, plan));
  }
});
