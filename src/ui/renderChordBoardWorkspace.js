import { escapeHtml } from "./escapeHtml.js";

function stringDescription(item) {
  if (item.state === "MUTED") {
    return `${item.stringNumber}. tel: kapalı.`;
  }

  if (item.state === "OPEN") {
    return `${item.stringNumber}. tel: açık.`;
  }

  return (
    `${item.stringNumber}. tel: ` +
    `${item.fret}. perde, ` +
    `${item.finger}. parmak.`
  );
}

function barreDescription(barre) {
  return (
    `${barre.finger}. parmak bare: ` +
    `${barre.fret}. perde, ` +
    `${barre.fromString}. telden ` +
    `${barre.toString}. tele.`
  );
}

function fretWindow(viewModel) {
  const positiveFrets = [
    ...viewModel.strings
      .map((item) => item.fret)
      .filter((fret) => fret > 0),
    ...viewModel.barres.map(
      (barre) => barre.fret,
    ),
  ];

  if (positiveFrets.length === 0) {
    return Object.freeze({
      firstFret: 1,
      lastFret: 5,
    });
  }

  const minimum = Math.min(...positiveFrets);
  const firstFret =
    minimum > 4 ? minimum : 1;

  return Object.freeze({
    firstFret,
    lastFret: firstFret + 4,
  });
}

function renderVisualString(
  item,
  firstFret,
) {
  const marker =
    item.state === "MUTED"
      ? "×"
      : item.state === "OPEN"
        ? "○"
        : String(item.finger);

  const displayFret =
    item.fret > 0
      ? item.fret - firstFret + 1
      : 0;

  return `
    <div
      class="chord-string chord-string-${escapeHtml(
        item.state.toLowerCase(),
      )}"
      data-string-number="${item.stringNumber}"
      data-fret="${item.fret}"
      data-finger="${item.finger}"
      style="--string-column: ${7 - item.stringNumber}; --display-fret: ${displayFret};"
    >
      <span class="chord-string-state">${escapeHtml(
        marker,
      )}</span>
      <span class="chord-string-line"></span>
      ${
        item.state === "FRETTED"
          ? `<span class="chord-fret-marker">${escapeHtml(
              item.finger,
            )}</span>`
          : ""
      }
    </div>
  `;
}

function renderVisualBarre(
  barre,
  firstFret,
) {
  const startColumn =
    7 - barre.fromString;
  const span =
    barre.fromString -
    barre.toString +
    1;
  const displayFret =
    barre.fret - firstFret + 1;

  return `
    <span
      class="chord-barre"
      data-fret="${barre.fret}"
      data-finger="${barre.finger}"
      data-from-string="${barre.fromString}"
      data-to-string="${barre.toString}"
      style="--barre-column: ${startColumn}; --barre-span: ${span}; --barre-fret: ${displayFret};"
    >${escapeHtml(barre.finger)}</span>
  `;
}

export function renderChordBoardWorkspace(
  viewModel,
) {
  if (
    viewModel === null ||
    typeof viewModel !== "object"
  ) {
    throw new TypeError(
      "CHORD_BOARD view model required",
    );
  }

  const window = fretWindow(viewModel);
  const fretWindowLabel =
    window.firstFret === 1
      ? ""
      : `<p class="chord-fret-window" aria-hidden="true">Perdeler ${window.firstFret}–${window.lastFret}</p>`;

  const strings = viewModel.strings
    .map(
      (item) =>
        `<li>${escapeHtml(
          stringDescription(item),
        )}</li>`,
    )
    .join("");

  const barres =
    viewModel.barres.length === 0
      ? ""
      : `
        <section class="chord-barres" aria-labelledby="chord-barres-title">
          <h2 id="chord-barres-title">Bareler</h2>
          <ul class="chord-barre-list">
            ${viewModel.barres
              .map(
                (barre) =>
                  `<li>${escapeHtml(
                    barreDescription(barre),
                  )}</li>`,
              )
              .join("")}
          </ul>
        </section>
      `;

  const teacherNote =
    typeof viewModel.teacherNote ===
      "string" &&
    viewModel.teacherNote.length > 0
      ? `
        <section class="chord-teacher-note" aria-labelledby="chord-teacher-note-title">
          <h2 id="chord-teacher-note-title">Öğretmen notu</h2>
          <p>${escapeHtml(
            viewModel.teacherNote,
          )}</p>
        </section>
      `
      : "";

  const offlineStatus =
    viewModel.offlineSaveFailed === true
      ? '<p class="offline-save-status" role="status">Çevrimdışı kaydedilemedi.</p>'
      : viewModel.offlineAvailable === true
        ? '<span class="offline-availability">Cihazda mevcut</span>'
        : "";

  return `
    <section class="chord-board-workspace" role="region" aria-label="Akor çalışması">
      <header class="chord-board-heading">
        <h1 id="chord-board-title">${escapeHtml(
          viewModel.chord.displaySymbol,
        )}</h1>
        <p class="chord-board-work-title">${escapeHtml(
          viewModel.title,
        )}</p>
        ${offlineStatus}
      </header>

      <div class="chord-diagram" aria-hidden="true">
        ${fretWindowLabel}
        <div class="chord-diagram-grid">
          ${viewModel.strings
            .map((item) =>
              renderVisualString(
                item,
                window.firstFret,
              ),
            )
            .join("")}
          ${viewModel.barres
            .map((barre) =>
              renderVisualBarre(
                barre,
                window.firstFret,
              ),
            )
            .join("")}
        </div>
      </div>

      <section class="chord-string-semantics" aria-labelledby="chord-strings-title">
        <h2 id="chord-strings-title">Teller</h2>
        <ol class="chord-string-list" aria-label="Gitar telleri">
          ${strings}
        </ol>
      </section>

      ${barres}
      ${teacherNote}
    </section>
  `;
}
