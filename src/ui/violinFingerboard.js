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
  1: Object.freeze({ title: "Birinci", lower: "birinci" }),
  2: Object.freeze({ title: "İkinci", lower: "ikinci" }),
  3: Object.freeze({ title: "Üçüncü", lower: "üçüncü" }),
  4: Object.freeze({ title: "Dördüncü", lower: "dördüncü" }),
});

const PLACEMENT_NAMES = Object.freeze({
  LOW: "Alçak",
  NORMAL: "Normal",
  HIGH: "Yüksek",
});

const STRING_ROWS = Object.freeze([
  Object.freeze({ id: "G", y: 20, gauge: 2.8 }),
  Object.freeze({ id: "D", y: 44, gauge: 2.3 }),
  Object.freeze({ id: "A", y: 68, gauge: 1.65 }),
  Object.freeze({ id: "E", y: 92, gauge: 1.1 }),
]);

let presentationSequence = 0;

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

  return `${name}. ${stringName} teli. ${fingerName.title} parmak. ${placementName} ${fingerName.lower} parmak.`;
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

// Paint from the approved MagicPath revision 467386809148641280.
// These decorations never supply pitch, time or finger-position authority.
function materialMarkup(scope, activeString) {
  const wirePaints = STRING_ROWS.map((row) => {
    const active = row.id === activeString;
    return `
      <linearGradient id="${scope}-wire-${row.id}" gradientUnits="userSpaceOnUse" x1="40" y1="${row.y - 1.9}" x2="40" y2="${row.y + 1.9}">
        <stop stop-color="${active ? "#916333" : "#64726c"}" />
        <stop offset=".35" stop-color="${active ? "#fff3cd" : "#f5f4df"}" />
        <stop offset=".52" stop-color="${active ? "#ecc476" : "#c5cabe"}" />
        <stop offset="1" stop-color="${active ? "#9c702f" : "#6f817b"}" />
      </linearGradient>
    `;
  }).join("");

  return `
    <defs>
      <linearGradient id="${scope}-maple" gradientUnits="userSpaceOnUse" x1="34" y1="5" x2="34" y2="111">
        <stop stop-color="#ead1a3" /><stop offset=".12" stop-color="#b0804c" /><stop offset=".38" stop-color="#d5ae75" /><stop offset=".8" stop-color="#875f39" /><stop offset="1" stop-color="#543d2c" />
      </linearGradient>
      <linearGradient id="${scope}-ebony" gradientUnits="userSpaceOnUse" x1="0" y1="5" x2="0" y2="108">
        <stop stop-color="#090c0c" /><stop offset=".15" stop-color="#191e1b" /><stop offset=".38" stop-color="#383d33" /><stop offset=".53" stop-color="#292e27" /><stop offset=".76" stop-color="#131a17" /><stop offset="1" stop-color="#050b0b" />
      </linearGradient>
      <linearGradient id="${scope}-nut" gradientUnits="userSpaceOnUse" x1="36" y1="0" x2="45" y2="0">
        <stop stop-color="#0a1010" /><stop offset=".34" stop-color="#61645a" /><stop offset=".59" stop-color="#41483f" /><stop offset="1" stop-color="#0a1111" />
      </linearGradient>
      <radialGradient id="${scope}-gloss" cx=".4" cy=".3" r=".7">
        <stop stop-color="#eee7c9" stop-opacity=".19" /><stop offset="1" stop-color="#eee7c9" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="${scope}-finger" cx=".3" cy=".24" r=".83">
        <stop stop-color="#fff2c7" /><stop offset=".3" stop-color="#f5d58c" /><stop offset=".69" stop-color="#dfad51" /><stop offset="1" stop-color="#a66b27" />
      </radialGradient>
      <clipPath id="${scope}-neck-clip">
        <path d="M42 11 Q42 8 46 8 L295 3 Q306 3 308 11 L308 101 Q307 109 296 109 L45 103 Q42 103 42 100Z" />
      </clipPath>
      ${wirePaints}
    </defs>
    <g aria-hidden="true">
      <path d="M35 12 Q34 6 42 5 L298 1 Q311 1 313 12 L313 103 Q311 111 298 111 L42 108 Q35 108 35 102Z" fill="#142521" opacity=".12" transform="translate(0 1)" />
      <path d="M35 11 Q34 5 42 4 L298 0 Q310 0 312 11 L312 102 Q310 111 298 111 L42 107 Q35 107 35 101Z" fill="url(#${scope}-maple)" />
      <path d="M42 11 Q42 8 46 8 L295 3 Q306 3 308 11 L308 101 Q307 109 296 109 L45 103 Q42 103 42 100Z" fill="url(#${scope}-ebony)" stroke="#17201a" stroke-width=".7" />
      <g clip-path="url(#${scope}-neck-clip)">
        <ellipse cx="172" cy="36" rx="157" ry="29" fill="url(#${scope}-gloss)" />
        <g fill="none" stroke="#b9bba0" stroke-width=".45" opacity=".1">
          <path d="M44 13 Q168 20 309 8" /><path d="M44 27 Q180 29 309 24" /><path d="M44 37 Q152 40 309 36" /><path d="M44 51 Q182 46 309 48" /><path d="M44 62 Q176 60 309 61" /><path d="M44 79 Q168 75 309 77" /><path d="M44 96 Q180 91 309 99" />
        </g>
        <path d="M44 9 297 4Q305 4 307 12" fill="none" stroke="#e2ddbd" stroke-width=".8" opacity=".32" />
        <path d="M44 102 296 108Q305 108 307 101" fill="none" stroke="#010908" stroke-width="3" opacity=".7" />
      </g>
      <rect x="36.5" y="8" width="8" height="96" rx="2" fill="url(#${scope}-nut)" stroke="#303a31" stroke-width=".75" />
      <line x1="42" y1="10" x2="42" y2="102" stroke="#d4d1af" stroke-width=".55" opacity=".35" />
    </g>
  `;
}

function violinSvg(snapshot, scope) {
  const primary = snapshot.primary;
  const ratio = Math.min(1, Math.max(0, primary.normalizedPosition));
  const x = 40 + ratio * 260;
  const activeRow = STRING_ROWS.find((row) => row.id === primary.stringId);
  const strings = STRING_ROWS.map(
    (row) => `
      <text x="8" y="${row.y + 5}" class="violin-string-label${row.id === primary.stringId ? " active-string-label" : ""}">${row.id}</text>
      <line x1="40" y1="${row.y + 2.1}" x2="300" y2="${row.y + 2.1}" stroke="#010b0b" stroke-width="${row.gauge + 1.3}" stroke-linecap="round" opacity=".55" />
      ${row.id === primary.stringId ? `<line x1="40" y1="${row.y}" x2="300" y2="${row.y}" stroke="#e2b863" stroke-width="${row.gauge + 4}" stroke-linecap="round" opacity=".23" />` : ""}
      <line
        x1="40"
        y1="${row.y}"
        x2="300"
        y2="${row.y}"
        class="violin-string${row.id === primary.stringId ? " active-string" : ""}"
        stroke="url(#${scope}-wire-${row.id})"
        stroke-width="${row.gauge}"
      />
      <line x1="41" y1="${row.y - row.gauge * 0.19}" x2="299" y2="${row.y - row.gauge * 0.19}" stroke="${row.id === primary.stringId ? "#fff5cf" : "#fffef0"}" stroke-width=".35" opacity=".62" />
    `,
  ).join("");

  const marker =
    primary.finger === 0
      ? ""
      : `
        <ellipse cx="${x + 1.5}" cy="${activeRow.y + 3}" rx="11.5" ry="10.5" fill="#000b0c" opacity=".55" aria-hidden="true" />
        <circle
          class="violin-stop-marker"
          data-finger="${primary.finger}"
          data-placement="${escapeHtml(primary.placement)}"
          data-stop-ratio="${ratio}"
          cx="${x}"
          cy="${activeRow.y}"
          r="11"
          fill="url(#${scope}-finger)"
        />
        <path d="M${x - 7.5} ${activeRow.y - 2} Q${x - 5.5} ${activeRow.y - 8} ${x + 2} ${activeRow.y - 7.5}" stroke="#fff6da" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".75" aria-hidden="true" />
        <text
          class="violin-stop-number"
          x="${x}"
          y="${activeRow.y + 4.5}"
        >${primary.finger}</text>
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
      ${materialMarkup(scope, primary.stringId)}
      ${strings}
      ${marker}
    </svg>
  `;
}

function availableMarkup(snapshot, scope) {
  const semantic = semanticText(snapshot);
  if (semantic === null) return neutralMarkup();
  const string = STRING_NAMES[snapshot.primary.stringId];
  const compact = `<strong>${escapeHtml(noteName(snapshot.pitch))}</strong> · ${snapshot.primary.finger === 0 ? "Açık " : ""}${escapeHtml(string)} teli · <span class="violin-finger-badge">${snapshot.primary.finger}</span>${snapshot.primary.finger === 0 ? "" : ` <span class="violin-placement">(${PLACEMENT_NAMES[snapshot.primary.placement]})</span>`}`;

  return `
    <div class="violin-fingerboard-state" data-playing="${snapshot.playing === true ? "true" : "false"}">
      ${violinSvg(snapshot, scope)}
      <p class="violin-fingering-text"><span class="violin-compact-label">${compact}</span><span class="violin-full-label">${escapeHtml(semantic)}</span></p>
    </div>
  `;
}

export function createViolinFingerboardPresentation({ root } = {}) {
  const paintScope = `st-violin-${++presentationSequence}`;
  function target() {
    try {
      return root?.querySelector?.("[data-violin-fingerboard]") ?? null;
    } catch {
      return null;
    }
  }

  function write(renderMarkup) {
    const element = target();
    if (element === null) return false;
    element.innerHTML = renderMarkup(`${paintScope}-compact`);
    const detail = root?.querySelector?.('[data-violin-detail-state]');
    if (detail) detail.innerHTML = renderMarkup(`${paintScope}-detail`);
    return true;
  }

  return Object.freeze({
    show(snapshot) {
      if (!validAvailable(snapshot)) {
        return write(neutralMarkup);
      }
      return write((scope) => availableMarkup(snapshot, scope));
    },

    clear() {
      return write(neutralMarkup);
    },
  });
}
