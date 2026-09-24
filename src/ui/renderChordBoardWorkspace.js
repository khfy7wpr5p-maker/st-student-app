import { escapeHtml } from "./escapeHtml.js";
import {
  renderChordDiagramSvg,
} from "./chordDiagramSvg.js";

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

function renderAccessibilityDescription(
  viewModel,
) {
  const strings = viewModel.strings
    .map(
      (item) =>
        `<li>${escapeHtml(
          stringDescription(item),
        )}</li>`,
    )
    .join("");

  const barres = viewModel.barres
    .map(
      (barre) =>
        `<li>${escapeHtml(
          barreDescription(barre),
        )}</li>`,
    )
    .join("");

  return `
    <div class="sr-only chord-accessibility-description">
      <p>${escapeHtml(
        viewModel.chord.displaySymbol,
      )} akorunun parmak düzeni.</p>
      <ol aria-label="Gitar telleri">
        ${strings}
      </ol>
      ${
        barres.length > 0
          ? `<ul aria-label="Bare bilgisi">${barres}</ul>`
          : ""
      }
    </div>
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

      <div class="chord-diagram-card">
        ${renderChordDiagramSvg(viewModel)}
      </div>

      ${renderAccessibilityDescription(
        viewModel,
      )}
      ${teacherNote}
    </section>
  `;
}
