import { STUDENT_APP_SCREENS } from "./studentAppController.js";
import { escapeHtml } from "./escapeHtml.js";
import { renderPracticeWorkspace } from "./renderPracticeWorkspace.js";

export { escapeHtml } from "./escapeHtml.js";

function renderStatus(status) {
  return `<div class="app-status" role="status" aria-live="polite">${escapeHtml(
    status ?? "",
  )}</div>`;
}

function renderSignIn({ signInAvailable }) {
  const disabled = signInAvailable ? "" : " disabled";

  return `
    <section aria-labelledby="page-title">
      <h1 id="page-title">ST Student</h1>
      <p>Çalışmalarına erişmek için giriş yap.</p>
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

export function renderStudentApp(
  state,
  { signInAvailable = true, status = "" } = {},
) {
  let body;

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
      body = renderPracticeWorkspace(state.practice);
      break;
    default:
      throw new Error("unknown student app screen");
  }

  return `<main class="student-app">${renderStatus(status)}${body}</main>`;
}
