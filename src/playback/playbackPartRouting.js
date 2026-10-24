import { readViolinConfiguration } from "../practice/practiceCapabilities.js";
import { childrenNamed, createBrowserMusicXmlParser, firstChildNamed, hasDescendantNamed, textOf } from "./musicXmlPlaybackDom.js";

export function resolvePlaybackPartInstruments(pkg, plan) {
  if (pkg?.playbackInstrument !== "VIOLIN") return null;
  const noteParts = new Set(plan.notes.map(note => note.partId));
  const violin = readViolinConfiguration(pkg);
  if (noteParts.size <= 1 && violin === null) return null;
  const fail = () => { throw new Error("ambiguous playback part instruments"); };
  if (violin === null) return fail();
  const doc = createBrowserMusicXmlParser().parse(pkg?.content?.score?.data);
  const root = doc?.documentElement;
  if (root?.localName !== "score-partwise") return fail();
  const lists = childrenNamed(root, "part-list");
  if (lists.length !== 1) return fail();
  const entries = childrenNamed(lists[0], "score-part");
  const bodies = childrenNamed(root, "part");
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
    const midi = childrenNamed(entry, "midi-instrument");
    if (midi.length === 0 || midi.some(node =>
      childrenNamed(node, "midi-program").length !== 1 ||
      Number(textOf(firstChildNamed(node, "midi-program"))) !== 1) ||
      hasDescendantNamed(bodies[index], "midi-instrument")) return fail();
    instruments[id] = "GRAND_PIANO";
  }
  return Object.freeze(instruments);
}
