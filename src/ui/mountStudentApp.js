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

export function mountStudentApp({
  root,
  controller,
  requestSignIn,
  notationAdapter = null,
}) {
  if (
    root === null ||
    typeof root !== "object" ||
    typeof root.addEventListener !== "function"
  ) {
    throw new TypeError("student app root element is required");
  }

  let status = "";
  let lastMarkup = null;
  let lastPresentationKey = null;
  let domGeneration = 0;
  let activeNotationKey = null;
  let lifecycle = Promise.resolve();
  let destroyed = false;

  function paint() {
    const state = controller.getState();
    const markup = renderStudentApp(state, {
      signInAvailable: typeof requestSignIn === "function",
      status,
    });
    const presentationKey = practicePresentationKey(state);

    if (
      markup !== lastMarkup ||
      presentationKey !== lastPresentationKey
    ) {
      root.innerHTML = markup;
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

    const renderKey = `${state.practice.packageId}:${generation}`;

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

    try {
      status = "";
      await dispatchStudentAppAction({
        action,
        publicationId,
        tempoBpm,
        repeatEnabled,
        controller,
        requestSignIn,
      });
    } catch {
      status = "İşlem tamamlanamadı.";
    }

    return render();
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

      lifecycle = lifecycle.then(async () => {
        await disposeActiveNotation();
        lastMarkup = null;
        lastPresentationKey = null;
      });

      return lifecycle;
    },
  });
}
