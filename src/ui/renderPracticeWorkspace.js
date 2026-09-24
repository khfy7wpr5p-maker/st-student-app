import { PRACTICE_CAPABILITY_STATES } from "../practice/practiceCapabilities.js";
import { escapeHtml } from "./escapeHtml.js";

function capabilityOf(practice, name) {
  const value = practice?.capabilities?.[name];

  return Object.values(PRACTICE_CAPABILITY_STATES).includes(value)
    ? value
    : PRACTICE_CAPABILITY_STATES.UNAVAILABLE;
}

function renderNotation(practice) {
  const capability = capabilityOf(practice, "notation");

  if (capability === PRACTICE_CAPABILITY_STATES.AVAILABLE) {
    return `
      <section class="practice-notation practice-primary" aria-labelledby="notation-heading">
        <h2 id="notation-heading">Nota</h2>
        <div id="st-score-root" role="region" aria-label="Nota"></div>
      </section>
    `;
  }

  if (capability === PRACTICE_CAPABILITY_STATES.ERROR) {
    return `
      <section class="practice-notation practice-primary" aria-labelledby="notation-heading">
        <h2 id="notation-heading">Nota</h2>
        <p role="status">Nota görüntülenemedi.</p>
      </section>
    `;
  }

  return `
    <section class="practice-notation practice-primary" aria-labelledby="notation-heading">
      <h2 id="notation-heading">Nota</h2>
      <p>Nota görünümü bu çalışma için kullanılamıyor.</p>
    </section>
  `;
}

function tempoValue(practice) {
  const value = practice?.practice?.tempoBpm;
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

function renderPlayback(practice) {
  const playback = capabilityOf(practice, "playback");

  if (playback === PRACTICE_CAPABILITY_STATES.ERROR) {
    return `
      <section class="practice-playback practice-secondary" aria-labelledby="playback-heading">
        <h2 id="playback-heading">Dinleme</h2>
        <p role="status">Dinleme kullanılamadı.</p>
      </section>
    `;
  }

  if (playback !== PRACTICE_CAPABILITY_STATES.AVAILABLE) {
    return `
      <section class="practice-playback practice-secondary" aria-labelledby="playback-heading">
        <h2 id="playback-heading">Dinleme</h2>
        <p>Dinleme bu çalışma için kullanılamıyor.</p>
      </section>
    `;
  }

  const tempo =
    capabilityOf(practice, "tempoChange") ===
    PRACTICE_CAPABILITY_STATES.AVAILABLE
      ? `
        <div class="practice-tempo">
          <label for="practice-tempo">Tempo</label>
          <input
            id="practice-tempo"
            data-practice-tempo
            type="number"
            min="20"
            max="300"
            step="1"
            inputmode="numeric"
            value="${escapeHtml(tempoValue(practice))}"
          >
          <span class="practice-tempo-unit" aria-hidden="true">BPM</span>
          <button
            type="button"
            class="practice-tempo-apply"
            data-action="set-practice-tempo"
            aria-label="Tempoyu uygula"
            title="Tempoyu uygula"
          ><span aria-hidden="true">✓</span></button>
        </div>
      `
      : "";

  const repeatChecked =
    practice?.practice?.measureRepeatEnabled === true ? " checked" : "";

  const repeat =
    capabilityOf(practice, "measureRepeat") ===
    PRACTICE_CAPABILITY_STATES.AVAILABLE
      ? `
        <label class="practice-repeat">
          <input type="checkbox" data-action="set-measure-repeat"${repeatChecked}>
          Ölçü tekrarını aç
        </label>
      `
      : "";

  const quality =
    practice?.playbackQuality === "APPROXIMATE"
      ? '<p class="practice-playback-quality">Yaklaşık çalma</p>'
      : "";

  return `
    <section class="practice-playback practice-secondary" aria-labelledby="playback-heading">
      <h2 id="playback-heading" class="sr-only">Dinleme</h2>
      <div class="practice-playback-toolbar">
        ${quality}
        <div class="practice-playback-controls" role="group" aria-label="Dinleme kontrolleri">
          <button
            type="button"
            class="practice-control-button"
            data-action="play-practice"
            aria-label="Dinle"
            title="Dinle"
          ><span aria-hidden="true">▶</span></button>
          <button
            type="button"
            class="practice-control-button"
            data-action="pause-practice"
            aria-label="Duraklat"
            title="Duraklat"
          ><span aria-hidden="true">⏸</span></button>
          <button
            type="button"
            class="practice-control-button"
            data-action="restart-practice"
            aria-label="Baştan"
            title="Baştan"
          ><span aria-hidden="true">↺</span></button>
        </div>
        ${tempo}
      </div>
      ${repeat}
    </section>
  `;
}

export function renderPracticeWorkspace(
  practice,
  {
    showHomeAction = true,
    showTitle = true,
  } = {},
) {
  if (practice === null || typeof practice !== "object") {
    throw new TypeError("practice state is required");
  }

  const homeAction = showHomeAction
    ? '<button type="button" data-action="go-home">Ana Sayfa</button>'
    : "";
  const title = showTitle
    ? `<h1 id="page-title">${escapeHtml(
        practice.title ?? "Çalışma",
      )}</h1>`
    : "";
  const sectionLabel = showTitle
    ? 'aria-labelledby="page-title"'
    : 'aria-label="Nota çalışması"';

  return `
    <section class="practice-workspace" ${sectionLabel}>
      ${title}
      ${homeAction}
      ${renderNotation(practice)}
      ${renderPlayback(practice)}
    </section>
  `;
}
