// Geometry intentionally aligned with
// st-guitar-chord-board/src/diagram-model.js @ 6f8b869c32e9c2c5045449f79f4a686c0a67bb6d.
// Student App consumes only the authorized exact voicing view model.

const X0 = 45;
const X1 = 315;
const TOP = 60;
const BOTTOM = 310;
const VISIBLE_FRETS = 5;

const STRING_STROKE_WIDTHS = Object.freeze({
  6: 4.8,
  5: 4.1,
  4: 3.4,
  3: 2.8,
  2: 2.2,
  1: 1.8,
});

function xForString(stringNumber) {
  return (
    X0 +
    ((6 - stringNumber) * (X1 - X0)) / 5
  );
}

function yForRow(row) {
  const fretHeight =
    (BOTTOM - TOP) / VISIBLE_FRETS;
  return TOP + (row - 0.5) * fretHeight;
}

function buildDiagramModel(viewModel) {
  const hasOpenString =
    viewModel.strings.some(
      (item) => item.fret === 0,
    );
  const positiveFrets =
    viewModel.strings
      .map((item) => item.fret)
      .filter((fret) => fret > 0);

  const baseFret =
    !hasOpenString &&
    positiveFrets.length > 0 &&
    Math.min(...positiveFrets) > 1
      ? Math.min(...positiveFrets)
      : 1;

  const strings = viewModel.strings.map(
    (item) => {
      if (item.fret < 0) {
        return Object.freeze({
          ...item,
          state: "muted",
          row: null,
        });
      }

      if (item.fret === 0) {
        return Object.freeze({
          ...item,
          state: "open",
          row: null,
        });
      }

      const row =
        item.fret - baseFret + 1;

      if (
        row < 1 ||
        row > VISIBLE_FRETS
      ) {
        throw new RangeError(
          `voicing fret ${item.fret} falls outside visible diagram window`,
        );
      }

      return Object.freeze({
        ...item,
        state: "fretted",
        row,
      });
    },
  );

  const barres = viewModel.barres.flatMap(
    (barre) => {
      const row =
        barre.fret - baseFret + 1;

      if (
        row < 1 ||
        row > VISIBLE_FRETS
      ) {
        return [];
      }

      return [
        Object.freeze({
          ...barre,
          row,
        }),
      ];
    },
  );

  return Object.freeze({
    baseFret,
    strings: Object.freeze(strings),
    barres: Object.freeze(barres),
  });
}

function diagramAriaLabel(
  viewModel,
  model,
) {
  const position =
    model.baseFret === 1
      ? "açık pozisyon"
      : `${model.baseFret}. perdeden`;

  return `${viewModel.chord.displaySymbol} gitar akor diyagramı, ${position}`;
}

export function renderChordDiagramSvg(
  viewModel,
) {
  const model =
    buildDiagramModel(viewModel);
  const fretHeight =
    (BOTTOM - TOP) / VISIBLE_FRETS;

  const vertical = model.strings
    .map(
      (item) =>
        `<line class="string-line string-${item.stringNumber}" data-string="${item.stringNumber}" x1="${xForString(item.stringNumber)}" y1="${TOP}" x2="${xForString(item.stringNumber)}" y2="${BOTTOM}" stroke-width="${STRING_STROKE_WIDTHS[item.stringNumber]}" />`,
    )
    .join("");

  const horizontal = Array.from(
    { length: VISIBLE_FRETS + 1 },
    (_, index) => {
      const y =
        TOP + index * fretHeight;
      const isNut =
        index === 0 &&
        model.baseFret === 1;
      const width = isNut ? 8 : 2.6;
      const classes = isNut
        ? "fret-line nut-line"
        : "fret-line";

      return `<line class="${classes}" data-fret-line="${index}" x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke-width="${width}" />`;
    },
  ).join("");

  const status = model.strings
    .map((item) => {
      const x =
        xForString(item.stringNumber);

      if (item.state === "open") {
        return `<circle cx="${x}" cy="30" r="9" class="open-mark" data-string="${item.stringNumber}"/>`;
      }

      if (item.state === "muted") {
        return `<text x="${x}" y="37" class="mute-mark" data-string="${item.stringNumber}">×</text>`;
      }

      return "";
    })
    .join("");

  const barres = model.barres
    .map((barre) => {
      const xA =
        xForString(barre.fromString);
      const xB =
        xForString(barre.toString);
      const left =
        Math.min(xA, xB) - 17;
      const width =
        Math.abs(xB - xA) + 34;
      const y =
        yForRow(barre.row) - 17;

      return `<rect x="${left}" y="${y}" width="${width}" height="34" rx="17" class="barre-mark" data-finger="${barre.finger}" data-fret="${barre.fret}" data-from-string="${barre.fromString}" data-to-string="${barre.toString}" />`;
    })
    .join("");

  const notes = model.strings
    .filter(
      (item) =>
        item.state === "fretted",
    )
    .map((item) => {
      const x =
        xForString(item.stringNumber);
      const y = yForRow(item.row);
      const label =
        item.finger > 0
          ? item.finger
          : "";

      return `<g class="finger-position" data-string="${item.stringNumber}" data-fret="${item.fret}"><circle cx="${x}" cy="${y}" r="17" class="finger-mark"/><text x="${x}" y="${y + 6}" class="finger-number">${label}</text></g>`;
    })
    .join("");

  const base =
    model.baseFret > 1
      ? `<text x="19" y="${yForRow(1) + 6}" class="base-fret">${model.baseFret}</text>`
      : "";

  return `<svg class="chord-diagram" viewBox="0 0 360 340" role="img" focusable="false" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" data-base-fret="${model.baseFret}" aria-label="${diagramAriaLabel(viewModel, model)}">
    <g class="fretboard-lines">${vertical}${horizontal}</g>
    <g class="string-status">${status}</g>
    ${base}${barres}${notes}
  </svg>`;
}
