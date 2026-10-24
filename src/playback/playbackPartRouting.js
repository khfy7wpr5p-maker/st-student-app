import { readViolinConfiguration } from "../practice/practiceCapabilities.js";
import { childrenNamed, createBrowserMusicXmlParser, elementChildren, firstChildNamed, hasDescendantNamed, localNameOf, textOf } from "./musicXmlPlaybackDom.js";

function hasOnlyDeclaredPianoInstruments(entry, body) {
  const declarations = childrenNamed(entry, "score-instrument");
  const midi = childrenNamed(entry, "midi-instrument");
  const ids = declarations.map(node => node.getAttribute("id"));
  const midiIds = midi.map(node => node.getAttribute("id"));
  if (ids.length === 0 || ids.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(ids).size !== ids.length || new Set(midiIds).size !== midiIds.length ||
      ids.length !== midiIds.length || midiIds.some(id => !ids.includes(id)) ||
      midi.some(node => childrenNamed(node, "midi-program").length !== 1 ||
        Number(textOf(firstChildNamed(node, "midi-program"))) !== 1) ||
      hasDescendantNamed(body, "midi-instrument")) return false;
  const pending = [body];
  while (pending.length) {
    const node = pending.pop();
    if (localNameOf(node) === "instrument" && !ids.includes(node.getAttribute("id"))) return false;
    pending.push(...elementChildren(node));
  }
  return true;
}

export function resolvePlaybackPartInstruments(pkg, plan) {
  if (pkg?.playbackInstrument !== "VIOLIN") return null;
  const noteParts = new Set(plan.notes.map(note => note.partId));
  const violin = readViolinConfiguration(pkg);
  const fail = () => { throw new Error("ambiguous playback part instruments"); };
  const doc = createBrowserMusicXmlParser().parse(pkg?.content?.score?.data);
  const root = doc?.documentElement;
  const lists = root?.localName === "score-partwise" ? childrenNamed(root, "part-list") : [];
  const bodies = root?.localName === "score-partwise" ? childrenNamed(root, "part") : [];
  const entries = lists.flatMap(list => childrenNamed(list, "score-part"));
  if (noteParts.size <= 1 && violin === null && entries.length <= 1 && bodies.length <= 1) return null;
  if (violin === null) return fail();
  if (root?.localName !== "score-partwise") return fail();
  if (lists.length !== 1) return fail();
  if (entries.length !== bodies.length) return fail();
  const ids = entries.map(entry => entry.getAttribute("id"));
  if (new Set(ids).size !== ids.length || !ids.includes(violin.targetPartId) ||
      bodies.some((body, i) => body.getAttribute("id") !== ids[i]) ||
      [...noteParts].some(id => !ids.includes(id))) return fail();
  if (entries.length === 1) return null;
  const instruments = Object.create(null);
  for (const [index, entry] of entries.entries()) {
    const id = ids[index];
    if (id === violin.targetPartId) {
      instruments[id] = "VIOLIN";
      continue;
    }
    if (!hasOnlyDeclaredPianoInstruments(entry, bodies[index])) return fail();
    instruments[id] = "GRAND_PIANO";
  }
  return Object.freeze(instruments);
}
