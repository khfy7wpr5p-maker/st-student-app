import { escapeHtml } from "./escapeHtml.js";

const NOTE_NAMES = Object.freeze({
  C: "Do",
  D: "Re",
  E: "Mi",
  F: "Fa",
  G: "Sol",
  A: "La",
  B: "Si",
});

const STRING_NAMES = Object.freeze({
  G: "Sol",
  D: "Re",
  A: "La",
  E: "Mi",
});

const FINGER_NAMES = Object.freeze({
  1: "Birinci",
  2: "İkinci",
  3: "Üçüncü",
  4: "Dördüncü",
});

const PLACEMENT_NAMES = Object.freeze({
  LOW: "Alçak",
  NORMAL: "Normal",
  HIGH: "Yüksek",
});

const STRING_ROWS = Object.freeze([
  Object.freeze({ id: "G", y: 20 }),
  Object.freeze({ id: "D", y: 44 }),
  Object.freeze({ id: "A", y: 68 }),
  Object.freeze({ id: "E", y: 92 }),
]);

function neutralMarkup() {
  return `
    <div class="violin-fingerboard-empty">
      <p class="violin-fingering-text">Çalma başladığında tel ve parmak konumu burada gösterilir.</p>
    </div>
  `;
}

function noteName(pitch) {
  const base = NOTE_NAMES[pitch?.step];
  if (base === undefined) return null;

  const alter = pitch?.alter ?? 0;
  if (alter === 0) return base;
  if (alter === 1) return `${base} diyez`;
  if (alter === -1) return `${base} bemol`;
  if (alter === 2) return `${base} çift diyez`;
  if (alter === -2) return `${base} çift bemol`;
  return null;
}

function semanticText(snapshot) {
  const name = noteName(snapshot.pitch);
  const stringName = STRING_NAMES[snapshot.primary?.stringId];
  if (name === null || stringName === undefined) return null;

  if (
    snapshot.primary?.finger === 0 &&
    snapshot.primary?.placement === "OPEN"
  ) {
    return `${name}. Açık ${stringName} teli.`;
  }

  const fingerName = FINGER_NAMES[snapshot.primary?.finger];
  const placementName = PLACEMENT_NAMES[snapshot.primary?.placement];
  if (fingerName === undefined || placementName === undefined) return null;

  return `${name}. ${stringName} teli. ${fingerName} parmak. ${placementName} ${fingerName.toLowerCase()} parmak.`;
}

function validAvailable(snapshot) {
  return (
    snapshot !== null &&
    typeof snapshot === "object" &&
    snapshot.state === "AVAILABLE" &&
    snapshot.primary !== null &&
    typeof snapshot.primary === "object" &&
    STRING_NAMES[snapshot.primary.stringId] !== undefined &&
    Number.isInteger(snapshot.primary.finger) &&
    snapshot.primary.finger >= 0 &&
    snapshot.primary.finger <= 4 &&
    typeof snapshot.primary.placement === "string" &&
    Number.isFinite(snapshot.primary.normalizedPosition) &&
    snapshot.primary.normalizedPosition >= 0 &&
    snapshot.primary.normalizedPosition <= 1 &&
    noteName(snapshot.pitch) !== null
  );
}

function violinSvg(snapshot) {
  const primary = snapshot.primary;
  const ratio = Math.min(1, Math.max(0, primary.normalizedPosition));
  const x = 40 + ratio * 260;
  const activeRow = STRING_ROWS.find((row) => row.id === primary.stringId);
  const strings = STRING_ROWS.map(
    (row) => `
      <text x="8" y="${row.y + 5}" class="violin-string-label">${row.id}</text>
      <line
        x1="40"
        y1="${row.y}"
        x2="300"
        y2="${row.y}"
        class="violin-string${row.id === primary.stringId ? " active-string" : ""}"
      />
    `,
  ).join("");

  const marker =
    primary.finger === 0
      ? ""
      : `
        <circle
          class="violin-stop-marker"
          data-finger="${primary.finger}"
          data-placement="${escapeHtml(primary.placement)}"
          data-stop-ratio="${ratio}"
          cx="${x}"
          cy="${activeRow.y}"
          r="8"
        />
      `;

  return `
    <svg
      class="violin-fingerboard-svg"
      viewBox="0 0 320 112"
      role="img"
      data-active-string="${escapeHtml(primary.stringId)}"
      style="--violin-stop: ${ratio * 100}%;"
      aria-label="${escapeHtml(semanticText(snapshot))}"
    >
      <line x1="40" y1="8" x2="40" y2="104" class="violin-nut-line" />
      ${strings}
      ${marker}
    </svg>
  `;
}

function availableMarkup(snapshot) {
  const semantic = semanticText(snapshot);
  if (semantic === null) return neutralMarkup();

  return `
    <div class="violin-fingerboard-state" data-playing="${snapshot.playing === true ? "true" : "false"}">
      ${violinSvg(snapshot)}
      <p class="violin-fingering-text">${escapeHtml(semantic)}</p>
    </div>
  `;
}

export function createViolinFingerboardPresentation({ root } = {}) {
  function target() {
    try {
      return root?.querySelector?.("[data-violin-fingerboard]") ?? null;
    } catch {
      return null;
    }
  }

  function write(markup) {
    const element = target();
    if (element === null) return false;
    element.innerHTML = markup;
    return true;
  }

  return Object.freeze({
    show(snapshot) {
      if (!validAvailable(snapshot)) {
        return write(neutralMarkup());
      }
      return write(availableMarkup(snapshot));
    },

    clear() {
      return write(neutralMarkup());
    },
  });
}
