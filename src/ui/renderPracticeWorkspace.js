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
      <section aria-labelledby="notation-heading">
        <h2 id="notation-heading">Nota</h2>
        <div id="st-score-root" role="region" aria-label="Nota"></div>
      </section>
    `;
  }

  if (capability === PRACTICE_CAPABILITY_STATES.ERROR) {
    return `
      <section aria-labelledby="notation-heading">
        <h2 id="notation-heading">Nota</h2>
        <p role="status">Nota görüntülenemedi.</p>
      </section>
    `;
  }

  return `
    <section aria-labelledby="notation-heading">
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
      <section aria-labelledby="playback-heading">
        <h2 id="playback-heading">Dinleme</h2>
        <p role="status">Dinleme kullanılamadı.</p>
      </section>
    `;
  }

  if (playback !== PRACTICE_CAPABILITY_STATES.AVAILABLE) {
    return `
      <section aria-labelledby="playback-heading">
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
          <button type="button" data-action="set-practice-tempo">Tempoyu Uygula</button>
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
    <section aria-labelledby="playback-heading">
      <h2 id="playback-heading">Dinleme</h2>
      ${quality}
      <div class="practice-playback-controls">
        <button type="button" data-action="play-practice">Dinle</button>
        <button type="button" data-action="pause-practice">Duraklat</button>
        <button type="button" data-action="restart-practice">Baştan</button>
      </div>
      ${tempo}
      ${repeat}
    </section>
  `;
}

export function renderPracticeWorkspace(
  practice,
  { showHomeAction = true } = {},
) {
  if (practice === null || typeof practice !== "object") {
    throw new TypeError("practice state is required");
  }

  const homeAction = showHomeAction
    ? '<button type="button" data-action="go-home">Ana Sayfa</button>'
    : "";

  return `
    <section class="practice-workspace" aria-labelledby="page-title">
      <h1 id="page-title">${escapeHtml(practice.title ?? "Çalışma")}</h1>
      ${homeAction}
      ${renderNotation(practice)}
      ${renderPlayback(practice)}
    </section>
  `;
}
