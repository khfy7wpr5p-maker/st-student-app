import { ASSIGNMENT_STATES, PRACTICE_TYPES } from "../contracts/privateAssignment.js";
import { CONNECTIVITY_STATES } from "../offline/connectivityPort.js";
import { STUDENT_APP_SCREENS } from "./studentAppController.js";
import { escapeHtml } from "./escapeHtml.js";
import { renderPracticeWorkspace } from "./renderPracticeWorkspace.js";

export { escapeHtml } from "./escapeHtml.js";

function connectivityText(connectivityState) {
  if (connectivityState === CONNECTIVITY_STATES.ONLINE) {
    return "Çevrimiçi";
  }

  if (connectivityState === CONNECTIVITY_STATES.OFFLINE) {
    return "Çevrimdışı";
  }

  return "";
}

function renderStatus(status, connectivityState) {
  const parts = [
    connectivityText(connectivityState),
    status ?? "",
  ].filter((part) => part.length > 0);

  return `<div class="app-status" role="status" aria-live="polite">${parts
    .map(escapeHtml)
    .join(" · ")}</div>`;
}

function renderSignIn({ signInAvailable }) {
  const disabled = signInAvailable ? "" : " disabled";

  return `
    <section aria-labelledby="page-title">
      <h1 id="page-title">ST Student</h1>
      <p>Çalışmalarına erişmek için giriş yap.</p>
      <label>
        E-posta
        <input
          type="email"
          data-sign-in-email
          autocomplete="email"
          inputmode="email"
          autocapitalize="none"
          spellcheck="false"
        >
      </label>
      <label>
        Şifre
        <input
          type="password"
          data-sign-in-password
          autocomplete="current-password"
        >
      </label>
      <button type="button" data-action="request-sign-in"${disabled}>Giriş Yap</button>
    </section>
  `;
}

function renderHome() {
  return `
    <section aria-labelledby="page-title">
      <h1 id="page-title">Ana Sayfa</h1>
      <nav aria-label="Ana menü">
        <button type="button" data-action="show-public-pool">Havuz</button>
        <button type="button" data-action="show-my-work">Benim Çalışmalarım</button>
        <button type="button" data-action="sign-out">Çıkış</button>
      </nav>
    </section>
  `;
}

function renderStudent08Home() {
  return `
    <section aria-labelledby="page-title">
      <h1 id="page-title">Çalışmalar</h1>
      <p>Havuzdan veya Benim Çalışmalarım bölümünden seçim yap.</p>
    </section>
  `;
}

function formatPublishedDate(value) {
  if (typeof value !== "string") {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());

  if (match === null) {
    return value.trim();
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function renderPublishedTime(value, className) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  const stableValue = value.trim();

  return `<time class="${className}" datetime="${escapeHtml(stableValue)}">${escapeHtml(
    formatPublishedDate(stableValue),
  )}</time>`;
}

function renderWorkList({ heading, items, emptyText }) {
  const content =
    items.length === 0
      ? `<p>${escapeHtml(emptyText)}</p>`
      : `
        <ul class="work-list">
          ${items
            .map(
              (item) => `
                <li>
                  <span>${escapeHtml(item.title)}</span>
                  ${
                    item.deviceAvailable === true
                      ? '<span class="offline-availability">Cihazda mevcut</span>'
                      : ""
                  }
                  <button
                    type="button"
                    data-action="open-practice"
                    data-publication-id="${escapeHtml(item.publicationId)}"
                  >Çalışmayı Aç</button>
                </li>
              `,
            )
            .join("")}
        </ul>
      `;

  return `
    <section aria-labelledby="page-title">
      <h1 id="page-title">${escapeHtml(heading)}</h1>
      <button type="button" data-action="go-home">Ana Sayfa</button>
      ${content}
    </section>
  `;
}

function renderPool(state) {
  const list =
    state.items.length === 0
      ? "<p>Havuzda henüz içerik yok.</p>"
      : `
        <ul class="pool-list">
          ${state.items
            .map(
              (item) => `
                <li>
                  <button
                    type="button"
                    class="pool-card"
                    data-action="open-pool-item"
                    data-pool-item-id="${escapeHtml(item.poolItemId)}"
                  >
                    <strong class="pool-card-title">${escapeHtml(item.title)}</strong>
                    ${
                      item.shortDescription
                        ? `<span class="pool-card-description">${escapeHtml(
                            item.shortDescription,
                          )}</span>`
                        : ""
                    }
                    ${renderPublishedTime(
                      item.publishedAt,
                      "pool-published-at",
                    )}
                  </button>
                </li>
              `,
            )
            .join("")}
        </ul>
      `;

  const detail =
    state.poolDetail === undefined
      ? ""
      : `
        <article class="pool-detail" aria-labelledby="pool-detail-title">
          <h2 id="pool-detail-title">${escapeHtml(state.poolDetail.title)}</h2>
          ${renderPublishedTime(
            state.poolDetail.publishedAt,
            "pool-detail-published-at",
          )}
          ${
            state.poolDetail.detailText
              ? `<p>${escapeHtml(state.poolDetail.detailText)}</p>`
              : ""
          }
        </article>
      `;

  return `
    <section aria-labelledby="page-title">
      <h1 id="page-title">Havuz</h1>
      ${list}
      ${detail}
    </section>
  `;
}

function folderButton(state, value, label) {
  const active = state.assignmentState === value;

  return `
    <button
      type="button"
      data-action="show-work-folder"
      data-assignment-state="${value}"
      aria-pressed="${active ? "true" : "false"}"
    >${label}</button>
  `;
}

function renderAssignmentItem(item) {
  const note =
    typeof item.teacherNote === "string" && item.teacherNote.length > 0
      ? `<p class="teacher-note"><span class="teacher-note-label">Öğretmen notu</span>${escapeHtml(
          item.teacherNote,
        )}</p>`
      : "";

  if (item.practiceType === PRACTICE_TYPES.SCORE) {
    return `
      <li>
        <article class="assignment-card assignment-card-score">
          <span class="assignment-type">Nota çalışması</span>
          <h2>${escapeHtml(item.title)}</h2>
          ${note}
          <button
            type="button"
            data-action="open-assignment"
            data-assignment-id="${escapeHtml(item.assignmentId)}"
          >Çalışmayı Aç</button>
        </article>
      </li>
    `;
  }

  return `
    <li>
      <article class="assignment-card assignment-card-chord-board">
        <span class="assignment-type">Akor çalışması</span>
        <h2>${escapeHtml(item.title)}</h2>
        ${note}
        <p class="assignment-unavailable">Bu akor çalışması henüz kullanıma hazır değil.</p>
      </article>
    </li>
  `;
}

function renderMyWork(state) {
  const items =
    state.items.length === 0
      ? "<p>Bu klasörde henüz çalışma yok.</p>"
      : `<ul class="assignment-list">${state.items
          .map(renderAssignmentItem)
          .join("")}</ul>`;

  return `
    <section aria-labelledby="page-title">
      <h1 id="page-title">Benim Çalışmalarım</h1>
      <nav class="work-folders" aria-label="Çalışma klasörleri">
        ${folderButton(
          state,
          ASSIGNMENT_STATES.ACTIVE,
          "Aktif Çalışmalar",
        )}
        ${folderButton(
          state,
          ASSIGNMENT_STATES.COMPLETED,
          "Bitmiş Çalışmalar",
        )}
        ${folderButton(
          state,
          ASSIGNMENT_STATES.REPERTOIRE,
          "Repertuarım",
        )}
      </nav>
      ${items}
    </section>
  `;
}

function renderPractice(practice, { showHomeAction = true } = {}) {
  const saveStatus =
    practice?.offlineSaveFailed === true
      ? '<p class="offline-save-status" role="status">Çevrimdışı kaydedilemedi.</p>'
      : "";

  return `${saveStatus}${renderPracticeWorkspace(practice, {
    showHomeAction,
  })}`;
}

function currentPageAttribute(active) {
  return active ? ' aria-current="page"' : "";
}

function renderStudent08Shell(body, state, statusMarkup = "") {
  const poolCurrent =
    state.screen === STUDENT_APP_SCREENS.PUBLIC_POOL;
  const practiceCurrent =
    state.screen === STUDENT_APP_SCREENS.PRACTICE;
  const myWorkCurrent =
    state.screen === STUDENT_APP_SCREENS.MY_WORK ||
    practiceCurrent;
  const shellClass = practiceCurrent
    ? "student-shell student-shell-practice"
    : "student-shell";
  const navigationStatus = practiceCurrent ? "" : statusMarkup;
  const contentStatus = practiceCurrent ? statusMarkup : "";

  return `
    <div class="${shellClass}">
      <aside class="student-navigation">
        ${navigationStatus}
        <nav aria-label="Öğrenci menüsü">
          <button
            type="button"
            aria-label="Havuz"
            ${currentPageAttribute(poolCurrent)}
            data-action="show-public-pool"
          ><span class="nav-label-full">Havuz</span><span class="nav-label-short" aria-hidden="true">Havuz</span></button>
          <button
            type="button"
            aria-label="Benim Çalışmalarım"
            ${currentPageAttribute(myWorkCurrent)}
            data-action="show-my-work"
          ><span class="nav-label-full">Benim Çalışmalarım</span><span class="nav-label-short" aria-hidden="true">Çalışmalar</span></button>
          <button
            type="button"
            aria-label="Çıkış"
            data-action="sign-out"
          ><span class="nav-label-full">Çıkış</span><span class="nav-label-short" aria-hidden="true">Çıkış</span></button>
        </nav>
      </aside>
      <div class="student-content">
        ${contentStatus}
        ${body}
      </div>
    </div>
  `;
}

export function renderStudentApp(
  state,
  {
    signInAvailable = true,
    status = "",
    connectivityState = null,
  } = {},
) {
  let body;
  let statusRenderedInsideShell = false;

  if (state.student08 === true) {
    switch (state.screen) {
      case STUDENT_APP_SCREENS.HOME:
        body = renderStudent08Home();
        break;
      case STUDENT_APP_SCREENS.PUBLIC_POOL:
        body = renderPool(state);
        break;
      case STUDENT_APP_SCREENS.MY_WORK:
        body = renderMyWork(state);
        break;
      case STUDENT_APP_SCREENS.PRACTICE:
        body = renderPractice(state.practice, { showHomeAction: false });
        break;
      case STUDENT_APP_SCREENS.SIGN_IN:
        body = renderSignIn({ signInAvailable });
        break;
      default:
        throw new Error("unknown student app screen");
    }

    if (state.screen !== STUDENT_APP_SCREENS.SIGN_IN) {
      body = renderStudent08Shell(
        body,
        state,
        renderStatus(status, connectivityState),
      );
      statusRenderedInsideShell = true;
    }
  } else {
    switch (state.screen) {
      case STUDENT_APP_SCREENS.SIGN_IN:
        body = renderSignIn({ signInAvailable });
        break;
      case STUDENT_APP_SCREENS.HOME:
        body = renderHome();
        break;
      case STUDENT_APP_SCREENS.PUBLIC_POOL:
        body = renderWorkList({
          heading: "Havuz",
          items: state.items,
          emptyText: "Havuzda henüz çalışma yok.",
        });
        break;
      case STUDENT_APP_SCREENS.MY_WORK:
        body = renderWorkList({
          heading: "Benim Çalışmalarım",
          items: state.items,
          emptyText: "Henüz atanmış çalışma yok.",
        });
        break;
      case STUDENT_APP_SCREENS.PRACTICE:
        body = renderPractice(state.practice);
        break;
      default:
        throw new Error("unknown student app screen");
    }
  }

  return `<main class="student-app">${statusRenderedInsideShell
    ? ""
    : renderStatus(status, connectivityState)}${body}</main>`;
}
