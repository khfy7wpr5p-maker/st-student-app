import { CONNECTIVITY_STATES } from "../offline/connectivityPort.js";
import { PRACTICE_CAPABILITY_STATES } from "../practice/practiceCapabilities.js";
import { STUDENT_APP_SCREENS } from "./studentAppController.js";
import { renderStudentApp } from "./renderStudentApp.js";
import { dispatchStudentAppAction } from "./shellActions.js";

function practicePresentationKey(state) {
  if (
    state.screen === STUDENT_APP_SCREENS.PRACTICE &&
    state.practice !== null
  ) {
    return `practice:${state.practice.packageId}`;
  }

  return state.screen;
}

function isNotationCapability(value) {
  return Object.values(PRACTICE_CAPABILITY_STATES).includes(value);
}

function statusForActionError(action, error) {
  if (action !== "show-my-work") {
    return "İşlem tamamlanamadı.";
  }

  const code =
    typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (
    code.includes("permission-denied") ||
    message.includes("insufficient permissions") ||
    message.includes("permission denied")
  ) {
    return "Kişisel çalışmalar için erişim izni reddedildi.";
  }

  const manifestFieldDiagnostics = [
    ["firestore packageid", "packageId"],
    ["packageid must", "packageId"],
    ["firestore publication title", "title"],
    ["scope mismatch", "scope"],
    ["publishedat must", "publishedAt"],
    ["publication id mismatch", "publicationId"],
    ["recipient mismatch", "recipientStudentId"],
  ];

  for (const [needle, fieldName] of manifestFieldDiagnostics) {
    if (message.includes(needle)) {
      return `Kişisel çalışma: ${fieldName} alanı eksik veya hatalı.`;
    }
  }

  if (message.includes("firestore publication")) {
    return "Kişisel çalışma kaydı eksik veya uyumsuz.";
  }

  return "Kişisel çalışmalar okunamadı.";
}

function focusedActionIdentity(root) {
  const activeElement = root.ownerDocument?.activeElement;

  if (
    activeElement === null ||
    activeElement === undefined ||
    root.contains?.(activeElement) !== true
  ) {
    return null;
  }

  const action = activeElement.dataset?.action;

  if (typeof action !== "string" || action.length === 0) {
    return null;
  }

  return Object.freeze({
    action,
    publicationId: activeElement.dataset?.publicationId ?? null,
  });
}

function restoreFocusedAction(root, identity) {
  if (identity === null) {
    return;
  }

  const controls = root.querySelectorAll?.("[data-action]");

  if (controls === null || controls === undefined) {
    return;
  }

  const match = [...controls].find(
    (control) =>
      control.dataset?.action === identity.action &&
      (control.dataset?.publicationId ?? null) === identity.publicationId,
  );

  if (typeof match?.focus !== "function") {
    return;
  }

  try {
    match.focus({ preventScroll: true });
  } catch {
    match.focus();
  }
}

export function mountStudentApp({
  root,
  controller,
  requestSignIn,
  requestSignOut,
  notationAdapter = null,
  connectivityPort = null,
}) {
  if (
    root === null ||
    typeof root !== "object" ||
    typeof root.addEventListener !== "function"
  ) {
    throw new TypeError("student app root element is required");
  }

  let status = "";
  let connectivityState =
    connectivityPort?.getState?.() === CONNECTIVITY_STATES.OFFLINE
      ? CONNECTIVITY_STATES.OFFLINE
      : connectivityPort?.getState?.() === CONNECTIVITY_STATES.ONLINE
        ? CONNECTIVITY_STATES.ONLINE
        : null;
  let unsubscribeConnectivity = () => {};
  let lastMarkup = null;
  let lastPresentationKey = null;
  let domGeneration = 0;
  let activeNotationKey = null;
  let persistentNotationRoot = null;
  let lifecycle = Promise.resolve();
  let destroyed = false;

  function paint() {
    const state = controller.getState();
    const markup = renderStudentApp(state, {
      signInAvailable: typeof requestSignIn === "function",
      status,
      connectivityState,
    });
    const presentationKey = practicePresentationKey(state);

    if (
      markup !== lastMarkup ||
      presentationKey !== lastPresentationKey
    ) {
      const focusIdentity =
        presentationKey === lastPresentationKey
          ? focusedActionIdentity(root)
          : null;

      const liveNotationRoot = root.querySelector?.("#st-score-root") ?? null;

      if (persistentNotationRoot === null && liveNotationRoot !== null) {
        persistentNotationRoot = liveNotationRoot;
      }

      root.innerHTML = markup;

      const replacementNotationRoot = root.querySelector?.("#st-score-root") ?? null;

      if (replacementNotationRoot !== null) {
        if (persistentNotationRoot === null) {
          persistentNotationRoot = replacementNotationRoot;
        } else if (replacementNotationRoot !== persistentNotationRoot) {
          if (typeof replacementNotationRoot.replaceWith === "function") {
            replacementNotationRoot.replaceWith(persistentNotationRoot);
          } else if (typeof replacementNotationRoot.parentNode?.replaceChild === "function") {
            replacementNotationRoot.parentNode.replaceChild(
              persistentNotationRoot,
              replacementNotationRoot,
            );
          }
        }
      }

      restoreFocusedAction(root, focusIdentity);
      lastMarkup = markup;
      lastPresentationKey = presentationKey;
      domGeneration += 1;
    }

    return Object.freeze({
      state,
      generation: domGeneration,
    });
  }

  async function disposeActiveNotation() {
    if (activeNotationKey === null) {
      return;
    }

    activeNotationKey = null;

    if (typeof notationAdapter?.dispose === "function") {
      try {
        await notationAdapter.dispose();
      } catch {
        // Student-facing state remains bounded even if a custom adapter fails.
      }
    }
  }

  function currentPracticeMatches(state, generation) {
    const current = controller.getState();

    return (
      current.screen === STUDENT_APP_SCREENS.PRACTICE &&
      current.practice !== null &&
      state.screen === STUDENT_APP_SCREENS.PRACTICE &&
      state.practice !== null &&
      current.practice.packageId === state.practice.packageId &&
      domGeneration === generation
    );
  }

  function updateNotationCapability(capability) {
    const normalized = isNotationCapability(capability)
      ? capability
      : PRACTICE_CAPABILITY_STATES.ERROR;

    controller.setNotationCapability(normalized);
    paint();
  }

  async function synchronizeNotation({ state, renderSource, generation }) {
    if (state.screen !== STUDENT_APP_SCREENS.PRACTICE) {
      await disposeActiveNotation();
      return;
    }

    if (
      state.practice === null ||
      state.practice.capabilities?.notation !==
        PRACTICE_CAPABILITY_STATES.AVAILABLE
    ) {
      await disposeActiveNotation();
      return;
    }

    if (!currentPracticeMatches(state, generation)) {
      return;
    }

    if (
      notationAdapter === null ||
      typeof notationAdapter.render !== "function" ||
      typeof notationAdapter.dispose !== "function"
    ) {
      await disposeActiveNotation();
      if (currentPracticeMatches(state, generation)) {
        updateNotationCapability(PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
      }
      return;
    }

    const renderKey = state.practice.packageId;

    if (activeNotationKey === renderKey) {
      return;
    }

    await disposeActiveNotation();

    if (
      renderSource === null ||
      renderSource?.kind !== "musicxml" ||
      typeof renderSource.musicXml !== "string"
    ) {
      if (currentPracticeMatches(state, generation)) {
        updateNotationCapability(PRACTICE_CAPABILITY_STATES.ERROR);
      }
      return;
    }

    let result;

    try {
      result = await notationAdapter.render({
        musicXml: renderSource.musicXml,
      });
    } catch {
      result = {
        capability: PRACTICE_CAPABILITY_STATES.ERROR,
      };
    }

    if (!currentPracticeMatches(state, generation)) {
      if (result?.capability === PRACTICE_CAPABILITY_STATES.AVAILABLE) {
        try {
          await notationAdapter.dispose();
        } catch {
          // Stale presentation is abandoned without surfacing internals.
        }
      }
      return;
    }

    const capability = isNotationCapability(result?.capability)
      ? result.capability
      : PRACTICE_CAPABILITY_STATES.ERROR;

    if (capability === PRACTICE_CAPABILITY_STATES.AVAILABLE) {
      activeNotationKey = renderKey;
      return;
    }

    activeNotationKey = null;
    updateNotationCapability(capability);
  }

  function render() {
    if (destroyed) {
      return lifecycle;
    }

    const snapshot = paint();
    const renderSource =
      snapshot.state.screen === STUDENT_APP_SCREENS.PRACTICE
        ? controller.getPracticeRenderSource?.() ?? null
        : null;

    lifecycle = lifecycle.then(() =>
      synchronizeNotation({
        state: snapshot.state,
        renderSource,
        generation: snapshot.generation,
      }),
    );

    return lifecycle;
  }

  async function onClick(event) {
    const actionElement = event.target?.closest?.("[data-action]");

    if (
      actionElement === null ||
      actionElement === undefined ||
      !root.contains(actionElement)
    ) {
      return;
    }

    const action = actionElement.dataset.action;
    const publicationId = actionElement.dataset.publicationId;

    const tempoBpm =
      action === "set-practice-tempo"
        ? Number(root.querySelector?.("[data-practice-tempo]")?.value)
        : undefined;

    const repeatEnabled =
      action === "set-measure-repeat"
        ? Boolean(actionElement.checked)
        : undefined;

    const credentials =
      action === "request-sign-in"
        ? Object.freeze({
            email:
              root.querySelector?.("[data-sign-in-email]")?.value ?? "",
            password:
              root.querySelector?.("[data-sign-in-password]")?.value ?? "",
          })
        : undefined;

    try {
      status = "";
      await dispatchStudentAppAction({
        action,
        publicationId,
        tempoBpm,
        repeatEnabled,
        credentials,
        controller,
        requestSignIn,
        requestSignOut,
      });
    } catch (error) {
      status = statusForActionError(action, error);
    }

    return render();
  }

  function onConnectivityChange(nextState) {
    if (destroyed) {
      return;
    }

    connectivityState =
      nextState === CONNECTIVITY_STATES.OFFLINE
        ? CONNECTIVITY_STATES.OFFLINE
        : nextState === CONNECTIVITY_STATES.ONLINE
          ? CONNECTIVITY_STATES.ONLINE
          : connectivityState;

    let syncResult;

    if (
      connectivityState === CONNECTIVITY_STATES.ONLINE &&
      typeof controller.synchronizeOffline === "function"
    ) {
      try {
        syncResult = controller.synchronizeOffline();
      } catch {
        syncResult = null;
      }
    }

    Promise.resolve(syncResult)
      .catch(() => null)
      .finally(() => {
        if (!destroyed) {
          render();
        }
      });
  }

  if (typeof connectivityPort?.subscribe === "function") {
    try {
      unsubscribeConnectivity =
        connectivityPort.subscribe(onConnectivityChange);
    } catch {
      unsubscribeConnectivity = () => {};
    }
  }

  root.addEventListener("click", onClick);
  render();

  return Object.freeze({
    render,

    destroy() {
      if (destroyed) {
        return lifecycle;
      }

      destroyed = true;
      root.removeEventListener("click", onClick);

      try {
        unsubscribeConnectivity();
      } catch {
        // Connectivity teardown cannot block Student App cleanup.
      }
      unsubscribeConnectivity = () => {};

      lifecycle = lifecycle.then(async () => {
        await disposeActiveNotation();
        lastMarkup = null;
        lastPresentationKey = null;
        persistentNotationRoot = null;
      });

      return lifecycle;
    },
  });
}
