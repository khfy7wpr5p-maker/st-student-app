import { escapeHtml } from "./escapeHtml.js";

function statusMarkup(status) {
  if (typeof status !== "string" || status.length === 0) {
    return '<div class="app-status" role="status" aria-live="polite"></div>';
  }

  return `<div class="app-status" role="status" aria-live="polite">${escapeHtml(status)}</div>`;
}

function invitedEmailField(email) {
  return `
    <label>
      Davet edilen e-posta
      <input
        type="email"
        data-sign-in-email
        value="${escapeHtml(email ?? "")}"
        readonly
        aria-readonly="true"
        autocomplete="email"
      >
    </label>
  `;
}

export function renderInviteActivation(state, { status = "" } = {}) {
  const phase = state?.phase ?? "ERROR";

  if (phase === "ACTIVE") {
    return `
      <div class="student-app">
        ${statusMarkup(status)}
        <section aria-labelledby="page-title">
          <h1 id="page-title">Davet kabul edildi</h1>
          <p>Öğrenci hesabın öğretmeninle güvenli şekilde bağlandı.</p>
          <button type="button" data-action="continue-student-app">ST Student’a Devam Et</button>
        </section>
      </div>
    `;
  }

  if (phase === "AUTHENTICATED_PENDING_ACTIVATION") {
    return `
      <div class="student-app">
        ${statusMarkup(status)}
        <section aria-labelledby="page-title">
          <h1 id="page-title">Öğrenci Daveti</h1>
          <p>Davet etkinleştirilemedi. Hesabın açık; yalnız bağlantıyı tekrar deneyebilirsin.</p>
          ${invitedEmailField(state?.email)}
          <button type="button" data-action="request-sign-in">Daveti Tekrar Dene</button>
        </section>
      </div>
    `;
  }

  if (phase === "READY") {
    const createMode = state?.accountMode === "CREATE";
    const actionText = createMode
      ? "Hesap Oluştur ve Daveti Kabul Et"
      : "Giriş Yap ve Daveti Kabul Et";
    const autocomplete = createMode ? "new-password" : "current-password";

    return `
      <div class="student-app">
        ${statusMarkup(status)}
        <section aria-labelledby="page-title">
          <h1 id="page-title">Öğrenci Daveti</h1>
          <p>${createMode ? "Hesabını oluştur ve öğretmen davetini kabul et." : "Mevcut hesabınla giriş yap ve öğretmen davetini kabul et."}</p>
          ${invitedEmailField(state?.email)}
          <label>
            Şifre
            <input
              type="password"
              data-sign-in-password
              data-invite-secret
              autocomplete="${autocomplete}"
            >
          </label>
          <button type="button" data-action="request-sign-in">${actionText}</button>
        </section>
      </div>
    `;
  }

  return renderInviteUnavailable();
}

export function renderInviteUnavailable() {
  return `
    <div class="student-app">
      <div class="app-status" role="status" aria-live="polite"></div>
      <section aria-labelledby="page-title">
        <h1 id="page-title">Öğrenci Daveti</h1>
        <p>Davet servisi şu anda kullanılamıyor.</p>
      </section>
    </div>
  `;
}

export function mountInviteActivation({
  root,
  flow,
  onContinue = () => globalThis.location?.reload?.(),
} = {}) {
  if (
    root === null ||
    typeof root !== "object" ||
    typeof root.addEventListener !== "function" ||
    typeof flow?.resolve !== "function" ||
    typeof flow?.activate !== "function" ||
    typeof flow?.getState !== "function"
  ) {
    throw new TypeError("invite activation mount seam is incomplete");
  }

  let status = "";
  let destroyed = false;

  function render() {
    if (!destroyed) {
      root.innerHTML = renderInviteActivation(flow.getState(), { status });
    }
  }

  async function start() {
    try {
      await flow.resolve();
      status = "";
      render();
    } catch {
      if (!destroyed) {
        root.innerHTML = renderInviteUnavailable();
      }
    }
  }

  async function onClick(event) {
    const actionElement = event?.target?.closest?.("[data-action]");
    if (actionElement === null || actionElement === undefined || !root.contains(actionElement)) {
      return;
    }

    const action = actionElement.dataset?.action;
    if (action === "continue-student-app") {
      onContinue();
      return;
    }
    if (action !== "request-sign-in") {
      return;
    }

    const secretInput = root.querySelector?.("[data-invite-secret]") ?? null;
    const secret = secretInput?.value ?? "";
    if (secretInput !== null) {
      secretInput.value = "";
    }

    status = "";
    try {
      await flow.activate({ password: secret });
    } catch {
      status = "İşlem tamamlanamadı. Tekrar deneyin.";
    }
    render();
  }

  root.addEventListener("click", onClick);

  return Object.freeze({
    start,
    render,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      root.removeEventListener("click", onClick);
    },
  });
}
