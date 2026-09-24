function stringState(fret) {
  if (fret === -1) {
    return "MUTED";
  }
  if (fret === 0) {
    return "OPEN";
  }
  return "FRETTED";
}

export function createChordBoardViewModel(
  item,
) {
  if (
    item === null ||
    typeof item !== "object" ||
    item.package?.packageType !==
      "CHORD_BOARD"
  ) {
    throw new TypeError(
      "CHORD_BOARD practice item required",
    );
  }

  const pkg = item.package;
  const snapshot = pkg.content?.chordBoard;
  const frets = snapshot?.voicing?.frets;
  const fingers = snapshot?.voicing?.fingers;
  const barres = snapshot?.voicing?.barres;

  if (
    !Array.isArray(frets) ||
    frets.length !== 6 ||
    !Array.isArray(fingers) ||
    fingers.length !== 6 ||
    !Array.isArray(barres)
  ) {
    throw new TypeError(
      "validated CHORD_BOARD voicing required",
    );
  }

  return Object.freeze({
    packageId: pkg.packageId,
    title: pkg.title,
    teacherNote:
      typeof pkg.practice?.teacherNote ===
      "string"
        ? pkg.practice.teacherNote
        : "",
    chord: Object.freeze({
      displaySymbol:
        snapshot.chord.displaySymbol,
      displayRoot:
        snapshot.chord.displayRoot,
    }),
    strings: Object.freeze(
      frets.map((fret, index) =>
        Object.freeze({
          stringNumber: 6 - index,
          fret,
          state: stringState(fret),
          finger: fingers[index],
        }),
      ),
    ),
    barres: Object.freeze(
      barres.map((barre) =>
        Object.freeze({
          finger: barre.finger,
          fret: barre.fret,
          fromString: barre.fromString,
          toString: barre.toString,
        }),
      ),
    ),
    offlineAvailable:
      item.offlineAvailability
        ?.deviceAvailable === true,
    offlineSaveFailed:
      item.offlineAvailability?.saveFailed ===
      true,
  });
}
