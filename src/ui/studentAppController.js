import { getAuthenticatedStudentId } from "../auth/session.js";
import { PRACTICE_CAPABILITY_STATES } from "../practice/practiceCapabilities.js";
import {
  createPracticeWorkspace,
  withNotationCapability,
  withPracticeCapability,
  withPracticeMeasureRepeatEnabled,
  withPracticeTempo,
} from "../practice/practiceWorkspace.js";
import { SYNC_STATES } from "../offline/syncCoordinator.js";

export const STUDENT_APP_SCREENS = Object.freeze({
  SIGN_IN: "sign_in",
  HOME: "home",
  PUBLIC_POOL: "public_pool",
  MY_WORK: "my_work",
  PRACTICE: "practice",
});

function freezeState({
  screen,
  session = null,
  items = [],
  practice = null,
  syncState,
}) {
  const value = {
    screen,
    session,
    items: Object.freeze([...items]),
    practice,
  };

  if (syncState !== undefined) {
    value.syncState = syncState;
  }

  return Object.freeze(value);
}

function requireSession(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("authenticated student session required");
  }

  return Object.freeze({ studentId });
}

function resolveMaybe(value, onResolved) {
  if (value !== null && typeof value?.then === "function") {
    return Promise.resolve(value).then(onResolved);
  }

  return onResolved(value);
}

function toWorkSummary(item) {
  const summary = {
    publicationId: item.publication.publicationId,
    packageId: item.package.packageId,
    title: item.package.title,
  };

  if (item.offlineAvailability !== undefined) {
    summary.deviceAvailable =
      item.offlineAvailability?.deviceAvailable === true;
  }

  return Object.freeze(summary);
}

function withOfflinePracticeMetadata(viewModel, item) {
  if (item.offlineAvailability === undefined) {
    return viewModel;
  }

  return Object.freeze({
    ...viewModel,
    deviceAvailable:
      item.offlineAvailability?.deviceAvailable === true,
    offlineSaveFailed:
      item.offlineAvailability?.saveFailed === true,
  });
}

export function createStudentAppController({
  sharingService,
  initialSession = null,
  notationAdapter = null,
  playbackPort = null,
  syncCoordinator = null,
}) {
  let currentSyncState =
    syncCoordinator === null ? undefined : SYNC_STATES.IDLE;

  const emptyState = () =>
    freezeState({
      screen: STUDENT_APP_SCREENS.SIGN_IN,
      syncState: currentSyncState,
    });

  let state = emptyState();
  let activePracticeRenderSource = null;
  let activePracticePackage = null;
  let sessionGeneration = 0;

  function clearActivePractice() {
    const previous = activePracticePackage;
    activePracticeRenderSource = null;
    activePracticePackage = null;

    if (previous !== null) {
      try {
        playbackPort?.disposePackage?.(previous);
      } catch {
        // Playback teardown cannot block navigation or authority changes.
      }
    }
  }

  function stateArgs(overrides = {}) {
    return {
      screen: state.screen,
      session: state.session,
      items: state.items,
      practice: state.practice,
      syncState: currentSyncState,
      ...overrides,
    };
  }

  if (initialSession !== null) {
    state = freezeState({
      screen: STUDENT_APP_SCREENS.HOME,
      session: requireSession(initialSession),
      syncState: currentSyncState,
    });
  }

  function requireCurrentSession() {
    return requireSession(state.session);
  }

  function sessionRequestIsCurrent(session, generation) {
    return (
      generation === sessionGeneration &&
      state.session?.studentId === session.studentId
    );
  }

  function requirePracticeCapability(name) {
    if (
      state.screen !== STUDENT_APP_SCREENS.PRACTICE ||
      state.practice === null ||
      activePracticePackage === null ||
      state.practice.capabilities?.[name] !==
        PRACTICE_CAPABILITY_STATES.AVAILABLE
    ) {
      throw new Error(`${name} capability unavailable`);
    }

    return activePracticePackage;
  }

  function setPracticeCapability(capabilityName, capability) {
    if (
      state.screen !== STUDENT_APP_SCREENS.PRACTICE ||
      state.practice === null
    ) {
      throw new Error("practice workspace is not active");
    }

    state = freezeState(
      stateArgs({
        practice: withPracticeCapability(
          state.practice,
          capabilityName,
          capability,
        ),
      }),
    );
  }

  function runPracticeOperation(capabilityName, operation) {
    try {
      const result = operation();

      if (result !== null && typeof result?.then === "function") {
        return Promise.resolve(result).catch((error) => {
          setPracticeCapability(
            capabilityName,
            PRACTICE_CAPABILITY_STATES.ERROR,
          );
          throw error;
        });
      }

      return result;
    } catch (error) {
      setPracticeCapability(
        capabilityName,
        PRACTICE_CAPABILITY_STATES.ERROR,
      );
      throw error;
    }
  }

  function setSyncState(nextState) {
    currentSyncState = nextState;
    state = freezeState(stateArgs());
    return state;
  }

  return Object.freeze({
    getState() {
      return state;
    },

    getPracticeRenderSource() {
      return state.screen === STUDENT_APP_SCREENS.PRACTICE
        ? activePracticeRenderSource
        : null;
    },

    disposeActivePractice() {
      clearActivePractice();
      return state;
    },

    attachSession(session) {
      const nextSession = requireSession(session);
      sessionGeneration += 1;
      clearActivePractice();

      if (syncCoordinator !== null) {
        currentSyncState = SYNC_STATES.IDLE;
      }

      state = freezeState({
        screen: STUDENT_APP_SCREENS.HOME,
        session: nextSession,
        syncState: currentSyncState,
      });
      return state;
    },

    showHome() {
      const session = requireCurrentSession();
      clearActivePractice();

      state = freezeState({
        screen: STUDENT_APP_SCREENS.HOME,
        session,
        syncState: currentSyncState,
      });
      return state;
    },

    showPublicPool() {
      const session = requireCurrentSession();
      const requestGeneration = sessionGeneration;
      const result = sharingService.listPublicPool({ session });

      return resolveMaybe(result, (items) => {
        if (!sessionRequestIsCurrent(session, requestGeneration)) {
          return state;
        }

        clearActivePractice();
        state = freezeState({
          screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
          session,
          items: items.map(toWorkSummary),
          syncState: currentSyncState,
        });
        return state;
      });
    },

    showMyWork() {
      const session = requireCurrentSession();
      const requestGeneration = sessionGeneration;
      const result = sharingService.listMyWork({ session });

      return resolveMaybe(result, (items) => {
        if (!sessionRequestIsCurrent(session, requestGeneration)) {
          return state;
        }

        clearActivePractice();
        state = freezeState({
          screen: STUDENT_APP_SCREENS.MY_WORK,
          session,
          items: items.map(toWorkSummary),
          syncState: currentSyncState,
        });
        return state;
      });
    },

    openPractice(publicationId) {
      const session = requireCurrentSession();
      const requestGeneration = sessionGeneration;
      const result = sharingService.getPracticeItem({
        session,
        publicationId,
      });

      return resolveMaybe(result, (item) => {
        if (!sessionRequestIsCurrent(session, requestGeneration)) {
          return state;
        }

        const workspace = createPracticeWorkspace({
          deliveryItem: item,
          notationRuntimeAvailable:
            notationAdapter?.isAvailable?.() === true,
          playbackPort,
        });

        clearActivePractice();
        activePracticeRenderSource = workspace.renderSource;
        activePracticePackage = item.package;

        state = freezeState({
          screen: STUDENT_APP_SCREENS.PRACTICE,
          session,
          practice: withOfflinePracticeMetadata(
            workspace.viewModel,
            item,
          ),
          syncState: currentSyncState,
        });
        return state;
      });
    },

    synchronizeOffline() {
      if (
        syncCoordinator === null ||
        typeof syncCoordinator?.sync !== "function"
      ) {
        return state;
      }

      const session = requireCurrentSession();
      setSyncState(SYNC_STATES.SYNCING);

      let result;

      try {
        result = syncCoordinator.sync({ session });
      } catch {
        return setSyncState(SYNC_STATES.SYNC_ERROR);
      }

      const applyResult = (outcome) => {
        const allowed = [
          SYNC_STATES.SYNCED,
          SYNC_STATES.SYNC_ERROR,
        ];
        return setSyncState(
          allowed.includes(outcome?.state)
            ? outcome.state
            : SYNC_STATES.SYNC_ERROR,
        );
      };

      if (result !== null && typeof result?.then === "function") {
        return Promise.resolve(result)
          .then(applyResult)
          .catch(() => setSyncState(SYNC_STATES.SYNC_ERROR));
      }

      return applyResult(result);
    },

    setNotationCapability(capability) {
      if (
        state.screen !== STUDENT_APP_SCREENS.PRACTICE ||
        state.practice === null
      ) {
        throw new Error("practice workspace is not active");
      }

      state = freezeState(
        stateArgs({
          practice: withNotationCapability(
            state.practice,
            capability,
          ),
        }),
      );
      return state;
    },

    playPractice() {
      const pkg = requirePracticeCapability("playback");
      return runPracticeOperation(
        "playback",
        () => playbackPort.playPackage(pkg),
      );
    },

    pausePractice() {
      const pkg = requirePracticeCapability("playback");
      return runPracticeOperation(
        "playback",
        () => playbackPort.pausePackage(pkg),
      );
    },

    restartPractice() {
      const pkg = requirePracticeCapability("playback");
      return runPracticeOperation(
        "playback",
        () => playbackPort.restartPackage(pkg),
      );
    },

    setPracticeTempo(bpm) {
      if (
        !Number.isFinite(bpm) ||
        bpm < 20 ||
        bpm > 300
      ) {
        throw new TypeError("tempo must be between 20 and 300 BPM");
      }

      const pkg = requirePracticeCapability("tempoChange");
      const packageId = pkg.packageId;
      const result = runPracticeOperation(
        "tempoChange",
        () => playbackPort.setTempoForPackage(pkg, bpm),
      );

      const applyTempo = () => {
        if (
          state.screen === STUDENT_APP_SCREENS.PRACTICE &&
          state.practice?.packageId === packageId
        ) {
          state = freezeState(
            stateArgs({
              practice: withPracticeTempo(state.practice, bpm),
            }),
          );
        }
        return state;
      };

      if (result !== null && typeof result?.then === "function") {
        return Promise.resolve(result).then(applyTempo);
      }

      return applyTempo();
    },

    setMeasureRepeatEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("repeat enabled must be boolean");
      }

      const pkg = requirePracticeCapability("measureRepeat");
      const packageId = pkg.packageId;
      const result = runPracticeOperation(
        "measureRepeat",
        () =>
          playbackPort.setMeasureRepeatEnabledForPackage(
            pkg,
            enabled,
          ),
      );

      const applyRepeat = () => {
        if (
          state.screen === STUDENT_APP_SCREENS.PRACTICE &&
          state.practice?.packageId === packageId
        ) {
          state = freezeState(
            stateArgs({
              practice: withPracticeMeasureRepeatEnabled(
                state.practice,
                enabled,
              ),
            }),
          );
        }
        return state;
      };

      if (result !== null && typeof result?.then === "function") {
        return Promise.resolve(result).then(applyRepeat);
      }

      return applyRepeat();
    },

    signOut() {
      sessionGeneration += 1;
      clearActivePractice();

      if (syncCoordinator !== null) {
        currentSyncState = SYNC_STATES.IDLE;
      }

      state = emptyState();
      return state;
    },
  });
}
