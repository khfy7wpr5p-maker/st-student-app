import { CONNECTIVITY_STATES } from "../offline/connectivityPort.js";
import { PRACTICE_CAPABILITY_STATES } from "../practice/practiceCapabilities.js";
import { fitNotationViewport } from "../practice/notationViewport.js";
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

  if (
    state.screen === STUDENT_APP_SCREENS.PIECE_WORKSPACE &&
    state.pieceWorkspace?.score?.practice !== null &&
    state.pieceWorkspace?.score?.practice !== undefined
  ) {
    return `piece:${state.pieceWorkspace.pieceAssignmentId}:score:${state.pieceWorkspace.score.practice.packageId}`;
  }

  return state.screen;
}

function practiceForState(state) {
  if (state.screen === STUDENT_APP_SCREENS.PRACTICE) {
    return state.practice;
  }

  if (state.screen === STUDENT_APP_SCREENS.PIECE_WORKSPACE) {
    return state.pieceWorkspace?.score?.practice ?? null;
  }

  return null;
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
    poolItemId: activeElement.dataset?.poolItemId ?? null,
    assignmentId: activeElement.dataset?.assignmentId ?? null,
    assignmentState: activeElement.dataset?.assignmentState ?? null,
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
      (control.dataset?.publicationId ?? null) === identity.publicationId &&
      (control.dataset?.poolItemId ?? null) === identity.poolItemId &&
      (control.dataset?.assignmentId ?? null) === identity.assignmentId &&
      (control.dataset?.assignmentState ?? null) === identity.assignmentState,
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
  scoreFollowCoordinator = null,
  violinFollowCoordinator = null,
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
  let activeNotationPresentationKey = null;
  let activeRenderEvidence = null;
  let activeScoreFollowKey = null;
  let activeViolinFollowKey = null;
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

      if (
        liveNotationRoot !== null &&
        liveNotationRoot === persistentNotationRoot
      ) {
        try {
          if (typeof liveNotationRoot.remove === "function") {
            liveNotationRoot.remove();
          } else {
            liveNotationRoot.parentNode?.removeChild?.(liveNotationRoot);
          }
        } catch {
          // Repaint still proceeds; notation capability remains independently degradable.
        }
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

  function targetInsidePersistentNotation(target) {
    if (
      persistentNotationRoot === null ||
      target === null ||
      target === undefined
    ) {
      return false;
    }

    if (target === persistentNotationRoot) {
      return true;
    }

    try {
      if (
        typeof persistentNotationRoot.contains === "function" &&
        persistentNotationRoot.contains(target)
      ) {
        return true;
      }
    } catch {
      // Fall through to the bounded closest check.
    }

    try {
      return (
        target.closest?.("#st-score-root") ===
        persistentNotationRoot
      );
    } catch {
      return false;
    }
  }

  async function clearScoreFollow() {
    if (activeScoreFollowKey === null) {
      return;
    }

    activeScoreFollowKey = null;
    if (
      typeof scoreFollowCoordinator?.clear ===
      "function"
    ) {
      try {
        await scoreFollowCoordinator.clear();
      } catch {
        // Follow presentation is independently degradable.
      }
    }
  }

  async function clearViolinFollow() {
    if (activeViolinFollowKey === null) {
      return;
    }

    activeViolinFollowKey = null;
    if (
      typeof violinFollowCoordinator?.clear ===
      "function"
    ) {
      try {
        await violinFollowCoordinator.clear();
      } catch {
        // Violin presentation is independently degradable.
      }
    }
  }

  async function synchronizeViolinFollow({
    state,
    generation,
  }) {
    if (
      violinFollowCoordinator === null ||
      typeof violinFollowCoordinator?.bind !==
        "function"
    ) {
      return;
    }

    const practice = practiceForState(state);
    const pieceScoreSelected =
      state.screen !== STUDENT_APP_SCREENS.PIECE_WORKSPACE ||
      state.pieceWorkspace?.selectedView === "SCORE";

    if (
      practice === null ||
      pieceScoreSelected !== true ||
      practice.capabilities?.violin !==
        PRACTICE_CAPABILITY_STATES.AVAILABLE ||
      practice.violin === null ||
      typeof practice.violin !== "object" ||
      typeof practice.violin.targetPartId !== "string" ||
      practice.violin.targetPartId.length === 0
    ) {
      await clearViolinFollow();
      return;
    }

    let followSource = null;
    try {
      followSource =
        controller.getScoreFollowSource?.() ??
        null;
    } catch {
      followSource = null;
    }

    if (
      followSource === null ||
      typeof followSource !== "object" ||
      followSource.sourceId !== practice.packageId ||
      followSource.pkg?.packageId !== practice.packageId ||
      typeof followSource.musicXml !== "string" ||
      followSource.musicXml.length === 0
    ) {
      await clearViolinFollow();
      return;
    }

    if (!currentPracticeMatches(state, generation)) {
      return;
    }

    const followKey =
      `${practicePresentationKey(state)}:${followSource.sourceId}:${generation}`;
    if (activeViolinFollowKey === followKey) {
      return;
    }

    await clearViolinFollow();

    if (!currentPracticeMatches(state, generation)) {
      return;
    }

    let bound = false;
    try {
      bound =
        violinFollowCoordinator.bind({
          pkg: followSource.pkg,
          sourceId: followSource.sourceId,
          musicXml: followSource.musicXml,
          targetPartId:
            practice.violin.targetPartId,
          ...(practice.violin.stringLengthMm ===
          undefined
            ? {}
            : {
                stringLengthMm:
                  practice.violin.stringLengthMm,
              }),
        }) === true;
    } catch {
      bound = false;
    }

    if (
      bound &&
      currentPracticeMatches(state, generation)
    ) {
      activeViolinFollowKey = followKey;
    } else if (bound) {
      try {
        await violinFollowCoordinator.clear?.();
      } catch {
        // Stale violin binding is abandoned.
      }
    }
  }

  async function synchronizeScoreFollow({
    state,
    renderSource,
    generation,
    renderKey,
    renderEvidence,
  }) {
    if (
      scoreFollowCoordinator === null ||
      typeof scoreFollowCoordinator?.bind !==
        "function"
    ) {
      return;
    }

    let followSource = null;
    try {
      followSource =
        controller.getScoreFollowSource?.() ??
        null;
    } catch {
      followSource = null;
    }

    if (
      followSource === null ||
      renderSource === null ||
      renderSource.sourceId !==
        followSource.sourceId ||
      renderEvidence === null ||
      typeof renderEvidence !== "object" ||
      renderEvidence.sourceId !==
        followSource.sourceId ||
      typeof renderEvidence.renderEpoch !==
        "string" ||
      renderEvidence.renderEpoch.length === 0
    ) {
      await clearScoreFollow();
      return;
    }

    if (!currentPracticeMatches(state, generation)) {
      return;
    }

    const followKey =
      `${renderKey}:${renderEvidence.renderEpoch}`;
    if (activeScoreFollowKey === followKey) {
      return;
    }

    await clearScoreFollow();

    if (!currentPracticeMatches(state, generation)) {
      return;
    }

    let bound = false;
    try {
      bound =
        scoreFollowCoordinator.bind({
          pkg: followSource.pkg,
          sourceId: followSource.sourceId,
          musicXml: followSource.musicXml,
          renderEvidence,
        }) === true;
    } catch {
      bound = false;
    }

    if (
      bound &&
      currentPracticeMatches(state, generation)
    ) {
      activeScoreFollowKey = followKey;
    } else if (bound) {
      try {
        await scoreFollowCoordinator.clear?.();
      } catch {
        // Stale follow binding is abandoned.
      }
    }
  }

  async function disposeActiveNotation() {
    await clearScoreFollow();

    if (activeNotationKey === null) {
      activeRenderEvidence = null;
      return;
    }

    activeNotationKey = null;
    activeNotationPresentationKey = null;
    activeRenderEvidence = null;

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
    const currentPractice = practiceForState(current);
    const requestedPractice = practiceForState(state);

    return (
      currentPractice !== null &&
      requestedPractice !== null &&
      practicePresentationKey(current) === practicePresentationKey(state) &&
      currentPractice.packageId === requestedPractice.packageId &&
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
    const practice = practiceForState(state);

    if (
      state.screen ===
        STUDENT_APP_SCREENS.PIECE_WORKSPACE &&
      state.pieceWorkspace?.selectedView ===
        "CHORDS"
    ) {
      await clearScoreFollow();
      return;
    }

    if (
      practice === null ||
      practice.capabilities?.notation !==
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

    const presentationKey =
      practicePresentationKey(state);
    const renderKey =
      `${presentationKey}:${renderSource?.sourceId ?? "missing"}`;

    const notationRootHasObservableChildren =
      persistentNotationRoot !== null &&
      (
        persistentNotationRoot.childNodes !== undefined ||
        persistentNotationRoot.children !== undefined
      );
    const notationRootHasContent =
      persistentNotationRoot !== null &&
      (
        !notationRootHasObservableChildren ||
        persistentNotationRoot.childNodes?.length > 0 ||
        persistentNotationRoot.children?.length > 0
      );

    if (
      activeNotationKey === renderKey &&
      notationRootHasContent
    ) {
      await synchronizeScoreFollow({
        state,
        renderSource,
        generation,
        renderKey,
        renderEvidence: activeRenderEvidence,
      });
      return;
    }

    if (
      activeNotationKey !== null &&
      activeNotationPresentationKey !==
        presentationKey
    ) {
      await disposeActiveNotation();
    }

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

    await clearScoreFollow();
    activeRenderEvidence = null;

    let result;

    try {
      result = await notationAdapter.render({
        musicXml: renderSource.musicXml,
        sourceId: renderSource.sourceId,
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
      try {
        fitNotationViewport(persistentNotationRoot, {
          viewportWidth: root.ownerDocument?.defaultView?.innerWidth,
        });
      } catch {
        // Viewport fitting is presentation-only.
      }
      activeNotationKey = renderKey;
      activeNotationPresentationKey =
        presentationKey;
      activeRenderEvidence =
        result?.evidence ?? null;
      await synchronizeScoreFollow({
        state,
        renderSource,
        generation,
        renderKey,
        renderEvidence: activeRenderEvidence,
      });
      return;
    }

    activeNotationKey = null;
    activeRenderEvidence = null;
    await clearScoreFollow();

    const tabRenderFailed =
      state.screen ===
        STUDENT_APP_SCREENS.PIECE_WORKSPACE &&
      state.pieceWorkspace?.selectedView ===
        "TAB";

    if (!tabRenderFailed) {
      updateNotationCapability(capability);
    }
  }

  function render() {
    if (destroyed) {
      return lifecycle;
    }

    const snapshot = paint();
    const renderSource =
      snapshot.state.screen === STUDENT_APP_SCREENS.PRACTICE ||
      snapshot.state.screen === STUDENT_APP_SCREENS.PIECE_WORKSPACE
        ? controller.getPracticeRenderSource?.() ?? null
        : null;

    lifecycle = lifecycle.then(async () => {
      await synchronizeNotation({
        state: snapshot.state,
        renderSource,
        generation: snapshot.generation,
      });

      const currentState = controller.getState();
      await synchronizeViolinFollow({
        state: currentState,
        generation: domGeneration,
      });
    });

    return lifecycle;
  }

  async function onClick(event) {
    const actionElement =
      event.target?.closest?.("[data-action]");

    if (
      actionElement === null ||
      actionElement === undefined
    ) {
      if (
        typeof scoreFollowCoordinator
          ?.handlePoint === "function" &&
        targetInsidePersistentNotation(
          event.target,
        )
      ) {
        try {
          await scoreFollowCoordinator
            .handlePoint({
              clientX: event.clientX,
              clientY: event.clientY,
            });
        } catch {
          // Score interaction failure must not repaint or expose internals.
        }
      }
      return;
    }

    if (!root.contains(actionElement)) {
      return;
    }

    const action = actionElement.dataset.action;
    const publicationId = actionElement.dataset.publicationId;
    const poolItemId = actionElement.dataset.poolItemId;
    const assignmentId = actionElement.dataset.assignmentId;
    const assignmentState = actionElement.dataset.assignmentState;
    const pieceAssignmentId =
      actionElement.dataset.pieceAssignmentId;
    const pieceView =
      actionElement.dataset.pieceView;
    const workRequestTitle =
      action === "submit-work-request"
        ? root.querySelector?.("[data-work-request-title]")?.value
        : undefined;
    const scrollPosition =
      action === "open-piece"
        ? root.ownerDocument?.defaultView?.scrollY
        : undefined;

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
        poolItemId,
        assignmentId,
        assignmentState,
        pieceAssignmentId,
        pieceView,
        workRequestTitle,
        scrollPosition,
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
      .then(() => {
        if (
          destroyed ||
          connectivityState !==
            CONNECTIVITY_STATES.ONLINE ||
          typeof controller
            .recoverActivePracticePlayback !==
            "function"
        ) {
          return null;
        }

        try {
          return controller
            .recoverActivePracticePlayback();
        } catch {
          return null;
        }
      })
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
        controller.disposeActivePractice?.();
      } catch {
        // Playback teardown cannot block final Student App cleanup.
      }

      try {
        unsubscribeConnectivity();
      } catch {
        // Connectivity teardown cannot block Student App cleanup.
      }
      unsubscribeConnectivity = () => {};

      lifecycle = lifecycle.then(async () => {
        await disposeActiveNotation();
        if (
          typeof scoreFollowCoordinator?.dispose ===
          "function"
        ) {
          try {
            await scoreFollowCoordinator.dispose();
          } catch {
            // Final follow teardown cannot block app cleanup.
          }
        }
        if (
          typeof violinFollowCoordinator?.dispose ===
          "function"
        ) {
          try {
            await violinFollowCoordinator.dispose();
          } catch {
            // Final violin follow teardown cannot block app cleanup.
          }
        }
        activeScoreFollowKey = null;
        activeViolinFollowKey = null;
        lastMarkup = null;
        lastPresentationKey = null;
        persistentNotationRoot = null;
      });

      return lifecycle;
    },
  });
}