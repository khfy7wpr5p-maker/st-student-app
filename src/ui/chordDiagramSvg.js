// Presentation adapted from Guitar Chord Board 0.22.0; geometry aligned with
// st-guitar-chord-board/src/diagram-model.js @ 7fb86d231c35e6d3ce7bc07c5b0cfbd845da4b30.
// Student App consumes only the authorized exact voicing view model.

const X0 = 66;
const X1 = 294;
const TOP = 46;
const BOTTOM = 428;
const VISIBLE_FRETS = 5;
let diagramSequence = 0;

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

function materialDefinitions(model, resourcePrefix) {
  const stringGradients=model.strings.map(s=>{
    const x=xForString(s.stringNumber);
    const radius=STRING_STROKE_WIDTHS[s.stringNumber]/2;
    const colors=s.stringNumber>=4
      ? ["#725031","#dfbc86","#fff2ce","#986e40"]
      : ["#757e80","#d9dfe0","#ffffff","#969fa2"];
    return `<linearGradient id="${resourcePrefix}-string-${s.stringNumber}" gradientUnits="userSpaceOnUse" x1="${x-radius}" y1="0" x2="${x+radius}" y2="0"><stop stop-color="${colors[0]}"/><stop offset=".38" stop-color="${colors[1]}"/><stop offset=".57" stop-color="${colors[2]}"/><stop offset="1" stop-color="${colors[3]}"/></linearGradient>`;
  }).join("");
  const fretGradients=Array.from({length:VISIBLE_FRETS+1},(_,i)=>{
    const y=TOP+i*(BOTTOM-TOP)/VISIBLE_FRETS;
    return `<linearGradient id="${resourcePrefix}-fret-${i}" gradientUnits="userSpaceOnUse" x1="0" y1="${y-3}" x2="0" y2="${y+3}"><stop stop-color="#656a65"/><stop offset=".28" stop-color="#f9f7ed"/><stop offset=".48" stop-color="#ffffff"/><stop offset=".72" stop-color="#b0b2a8"/><stop offset="1" stop-color="#555b56"/></linearGradient>`;
  }).join("");
  return `<defs>
    <linearGradient id="${resourcePrefix}-neck-edge" x2="1" y2="0"><stop stop-color="#4b2c18"/><stop offset=".06" stop-color="#b58651"/><stop offset=".12" stop-color="#644126"/><stop offset=".88" stop-color="#513721"/><stop offset=".96" stop-color="#bd945f"/><stop offset="1" stop-color="#53331d"/></linearGradient>
    <linearGradient id="${resourcePrefix}-dark-wood" x2="1" y2="0"><stop stop-color="#363831"/><stop offset=".13" stop-color="#1d211e"/><stop offset=".5" stop-color="#30322b"/><stop offset=".85" stop-color="#181d19"/><stop offset="1" stop-color="#33372e"/></linearGradient>
    <linearGradient id="${resourcePrefix}-ivory" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#fffdf5"/><stop offset=".45" stop-color="#f8efd9"/><stop offset="1" stop-color="#d3bd94"/></linearGradient>
    <pattern id="${resourcePrefix}-wood-grain" width="41" height="164" patternUnits="userSpaceOnUse"><path d="M4 0Q1 43 5 82T4 164M18 0Q23 52 18 82T18 164M31 0Q27 57 31 82T31 164" fill="none" stroke="#b8b499" stroke-opacity=".13" stroke-width=".7"/><path d="M9 0Q13 43 9 82T9 164M35 0Q39 43 35 82T35 164" fill="none" stroke="#070c09" stroke-opacity=".4" stroke-width="1.2"/></pattern>
    <filter id="${resourcePrefix}-neck-shadow" x="-25%" y="-10%" width="155%" height="125%"><feDropShadow dx="7" dy="8" stdDeviation="5" flood-color="#362b1d" flood-opacity=".25"/></filter>
    <filter id="${resourcePrefix}-marker-shadow" x="-30%" y="-50%" width="160%" height="210%"><feDropShadow dx="1" dy="3" stdDeviation="1.6" flood-color="#000" flood-opacity=".5"/></filter>
    ${stringGradients}${fretGradients}
  </defs>`;
}

export function renderChordDiagramSvg(viewModel) {
  const model=buildDiagramModel(viewModel);
  const resourcePrefix=`student-chord-${++diagramSequence}`;
  const fretHeight=(BOTTOM-TOP)/VISIBLE_FRETS;
  const vertical=model.strings.map(s => {
    const x=xForString(s.stringNumber);
    const width=STRING_STROKE_WIDTHS[s.stringNumber];
    const winding=s.stringNumber>=4
      ? `<line class="string-winding" x1="${x}" y1="${TOP}" x2="${x}" y2="${BOTTOM}" stroke-width="${width}"/>`
      : "";
    return `<line class="string-shadow" x1="${x+1}" y1="${TOP}" x2="${x+1}" y2="${BOTTOM}" stroke-width="${width+1}"/><line class="string-line string-${s.stringNumber}" data-string="${s.stringNumber}" x1="${x}" y1="${TOP}" x2="${x}" y2="${BOTTOM}" stroke-width="${width}" style="stroke:url(#${resourcePrefix}-string-${s.stringNumber})"/>${winding}`;
  }).join("");
  const horizontal=Array.from({length:VISIBLE_FRETS+1},(_,i)=>{
    const y=TOP+i*fretHeight;
    const isNut=i===0&&model.baseFret===1;
    const width=isNut?8:5.4;
    const classes=isNut?"fret-line nut-line":"fret-line";
    const left=56-i*8/VISIBLE_FRETS;
    const nut=isNut?`<rect class="nut-body" x="48" y="38" width="264" height="17" rx="7" fill="url(#${resourcePrefix}-ivory)"/>`:"";
    return `${nut}<line class="fret-shadow" x1="${left}" y1="${y+2}" x2="${360-left}" y2="${y+2}"/><line class="${classes}" data-fret-line="${i}" x1="${left}" y1="${y}" x2="${360-left}" y2="${y}" stroke-width="${width}" style="stroke:${isNut?"#f4e4c1":`url(#${resourcePrefix}-fret-${i})`}"/>`;
  }).join("");

  const status=model.strings.map(s=>{
    const x=xForString(s.stringNumber);
    if(s.state==="open") return `<circle cx="${x}" cy="17" r="8" class="open-mark" data-string="${s.stringNumber}"/>`;
    if(s.state==="muted") return `<text x="${x}" y="25" class="mute-mark" data-string="${s.stringNumber}">×</text>`;
    return "";
  }).join("");

  const barres=model.barres.map(b=>{
    const xA=xForString(b.fromString);
    const xB=xForString(b.toString);
    const left=Math.min(xA,xB)-17;
    const width=Math.abs(xB-xA)+34;
    const y=yForRow(b.row)-17;
    return `<rect x="${left}" y="${y}" width="${width}" height="34" rx="17" class="barre-mark" style="fill:url(#${resourcePrefix}-ivory);filter:url(#${resourcePrefix}-marker-shadow)" data-finger="${b.finger}" data-fret="${b.fret}" data-from-string="${b.fromString}" data-to-string="${b.toString}" />`;
  }).join("");

  const notes=model.strings.filter(s=>s.state==="fretted").map(s=>{
    const x=xForString(s.stringNumber);
    const y=yForRow(s.row);
    const label=s.finger>0?s.finger:"";
    return `<g class="finger-position" data-string="${s.stringNumber}" data-fret="${s.fret}"><circle cx="${x}" cy="${y}" r="17" class="finger-mark" style="fill:url(#${resourcePrefix}-ivory);filter:url(#${resourcePrefix}-marker-shadow)"/><text x="${x}" y="${y+6}" class="finger-number">${label}</text></g>`;
  }).join("");

  const fretNumbers=Array.from({length:VISIBLE_FRETS},(_,i)=>
    `<text x="26" y="${yForRow(i+1)+6}" class="${model.baseFret>1&&i===0?"base-fret ":""}fret-number">${model.baseFret+i}</text>`
  ).join("");
  const stringNumbers=model.strings.map(s=>
    `<text x="${xForString(s.stringNumber)}" y="462" class="string-number">${s.stringNumber}</text>`
  ).join("");

  return `<svg class="chord-diagram" viewBox="0 0 360 480" role="img" focusable="false" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" data-base-fret="${model.baseFret}" aria-label="${diagramAriaLabel(viewModel,model)}">
    ${materialDefinitions(model,resourcePrefix)}
    <g class="neck-surface" filter="url(#${resourcePrefix}-neck-shadow)"><path d="M49 46Q49 36 59 36H301Q311 36 311 46L320 439H40Z" fill="url(#${resourcePrefix}-neck-edge)"/><path d="M58 46H302L309 434H51Z" fill="url(#${resourcePrefix}-dark-wood)"/><path d="M58 46H302L309 434H51Z" fill="url(#${resourcePrefix}-wood-grain)"/></g>
    <g class="fretboard-lines">${horizontal}${vertical}</g>
    <g class="string-status">${status}</g>
    <g class="fret-numbers">${fretNumbers}</g>
    <g class="finger-markers">${barres}${notes}</g>
    <g class="string-numbers">${stringNumbers}</g>
  </svg>`;
}
