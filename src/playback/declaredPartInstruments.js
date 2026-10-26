import { readViolinConfiguration } from '../practice/practiceCapabilities.js';
import { childrenNamed, createBrowserMusicXmlParser, elementChildren, localNameOf, textOf } from './musicXmlPlaybackDom.js';

const MARKER = 'seslitab-part-instruments-version';
const PROGRAMS = new Map([[1, 'GRAND_PIANO'], [25, 'CLASSICAL_GUITAR'], [41, 'VIOLIN']]);
const fail = () => { throw new Error('explicit playback part instruments unavailable'); };
function descendants(node) {
  const result = [], pending = [...elementChildren(node)];
  while (pending.length) { const child = pending.pop();result.push(child);pending.push(...elementChildren(child)); }
  return result;
}
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 128 && id.trim() === id && !id.includes('\u0000');

// Only an explicit Teacher-derived marker opts in. Unmarked assignments keep
// their original instrument semantics, even when MIDI declarations differ.
export function readDeclaredPartInstruments(pkg, plan) {
  const root = createBrowserMusicXmlParser().parse(pkg?.content?.score?.data)?.documentElement;
  if (!root) return null;
  const fields = descendants(root).filter(n => localNameOf(n) === 'miscellaneous-field' && n.getAttribute('name') === MARKER);
  if (!fields.length) return null;
  const field = fields[0];
  if (fields.length !== 1 || textOf(field) !== '1' || localNameOf(field.parentNode) !== 'miscellaneous' || localNameOf(field.parentNode.parentNode) !== 'identification' || field.parentNode.parentNode.parentNode !== root || localNameOf(root) !== 'score-partwise') fail();
  const lists = childrenNamed(root, 'part-list'), bodies = childrenNamed(root, 'part');
  if (lists.length !== 1) fail();
  const entries = childrenNamed(lists[0], 'score-part'), ids = entries.map(n => n.getAttribute('id'));
  const byId = new Map(bodies.map(n => [n.getAttribute('id'), n]));
  if (!ids.length || ids.length > 128 || ids.length !== bodies.length || new Set(ids).size !== ids.length || byId.size !== bodies.length || ids.some(id => !validId(id) || !byId.has(id)) || plan.notes.some(n => !ids.includes(n.partId))) fail();
  const mapping = Object.create(null);
  const allDeclarationIds = new Set(ids);
  entries.forEach((entry, i) => {
    const declarations = childrenNamed(entry, 'score-instrument').map(n => n.getAttribute('id'));
    const midi = childrenNamed(entry, 'midi-instrument');
    if (!declarations.length || declarations.some(id => !validId(id)) || new Set(declarations).size !== declarations.length || midi.length !== declarations.length || new Set(midi.map(n => n.getAttribute('id'))).size !== midi.length) fail();
    for (const id of declarations) { if (allDeclarationIds.has(id)) fail();allDeclarationIds.add(id); }
    const instruments = midi.map(n => {
      const programs = childrenNamed(n, 'midi-program'), banks = childrenNamed(n, 'midi-bank'), channels = childrenNamed(n, 'midi-channel');
      if (!declarations.includes(n.getAttribute('id')) || programs.length !== 1 || banks.length > 1 || banks.some(b => Number(textOf(b)) !== 1) || channels.length > 1 || channels.some(c => !Number.isInteger(Number(textOf(c))) || Number(textOf(c)) < 1 || Number(textOf(c)) > 16 || Number(textOf(c)) === 10) || childrenNamed(n, 'midi-unpitched').length) fail();
      const instrument = PROGRAMS.get(Number(textOf(programs[0])));
      if (!instrument) fail();
      return instrument;
    });
    if (new Set(instruments).size !== 1) fail();
    for (const n of descendants(byId.get(ids[i]))) {
      if (['midi-instrument', 'instrument-change', 'midi-device'].includes(localNameOf(n)) || (localNameOf(n) === 'instrument' && !declarations.includes(n.getAttribute('id')))) fail();
    }
    mapping[ids[i]] = instruments[0];
  });
  const violin = readViolinConfiguration(pkg), hasViolin = Object.values(mapping).includes('VIOLIN');
  if (![...PROGRAMS.values()].includes(pkg?.playbackInstrument)) fail();
  if (hasViolin ? pkg.playbackInstrument !== 'VIOLIN' || violin === null || mapping[violin.targetPartId] !== 'VIOLIN' : pkg.playbackInstrument === 'VIOLIN' || violin !== null) fail();
  return Object.freeze(mapping);
}
