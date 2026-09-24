import { getAuthenticatedStudentId } from "../auth/session.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../contracts/privateAssignment.js";
import { PRACTICE_CAPABILITY_STATES } from "../practice/practiceCapabilities.js";
import {
  createPracticeWorkspace,
  withNotationCapability,
  withPracticeCapability,
  withPracticeMeasureRepeatEnabled,
  withPracticeTempo,
} from "../practice/practiceWorkspace.js";
import { SYNC_STATES } from "../offline/syncCoordinator.js";
import {
  createChordBoardViewModel,
} from "./chordBoardViewModel.js";

export const STUDENT_APP_SCREENS = Object.freeze({
  SIGN_IN: "sign_in",
  HOME: "home",
  PUBLIC_POOL: "public_pool",
  MY_WORK: "my_work",
  PRACTICE: "practice",
  CHORD_BOARD: "chord_board",
});

function freezeState({
  screen,
  session = null,
  items = [],
  practice = null,
  chordBoard = null,
  syncState,
  student08 = false,
  poolDetail,
  assignmentState,
}) {
  const value = {
    screen,
    session,
    items: Object.freeze([...items]),
    practice,
    chordBoard,
  };

  if (syncState !== undefined) {
    value.syncState = syncState;
  }

  if (student08 === true) {
    value.student08 = true;
  }

  if (poolDetail !== undefined) {
    value.poolDetail = poolDetail;
  }

  if (assignmentState !== undefined) {
    value.assignmentState = assignmentState;
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

function toPoolSummary(item) {
  return Object.freeze({
    poolItemId: item.poolItemId,
    title: item.title,
    shortDescription: item.shortDescription ?? "",
    publishedAt: item.publishedAt ?? "",
  });
}

function toPoolDetail(item) {
  return Object.freeze({
    poolItemId: item.poolItemId,
    title: item.title,
    shortDescription: item.shortDescription ?? "",
    detailText: item.detailText ?? "",
    publishedAt: item.publishedAt ?? "",
  });
}

function toAssignmentSummary(item) {
  const practiceType = item.practiceType;
  const fallbackTitle =
    practiceType === PRACTICE_TYPES.CHORD_BOARD
      ? "Akor çalışması"
      : "Nota çalışması";

  return Object.freeze({
    assignmentId: item.assignmentId,
    title:
      typeof item.title === "string" && item.title.trim().length > 0
        ? item.title
        : fallbackTitle,
    practiceType,
    teacherNote:
      typeof item.teacherNote === "string" ? item.teacherNote : "",
    state: item.state,
    assignedAt: item.assignedAt ?? "",
  });
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
  student08ReadService = null,
  initialSession = null,
  notationAdapter = null,
  playbackPort = null,
  syncCoordinator = null,
}) {
  const student08Enabled = student08ReadService !== null;
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
      chordBoard: state.chordBoard,
      syncState: currentSyncState,
      student08: state.student08 === true,
      poolDetail: state.poolDetail,
      assignmentState: state.assignmentState,
      ...overrides,
    };
  }

  if (initialSession !== null) {
    state = freezeState({
      screen: STUDENT_APP_SCREENS.HOME,
      session: requireSession(initialSession),
      syncState: currentSyncState,
      student08: student08Enabled,
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

  function activatePracticeItem({
    item,
    session,
    requestGeneration,
  }) {
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
      student08: student08Enabled,
    });
    return state;
  }

  function activateChordBoardItem({
    item,
    session,
    requestGeneration,
  }) {
    if (!sessionRequestIsCurrent(session, requestGeneration)) {
      return state;
    }

    clearActivePractice();
    state = freezeState({
      screen: STUDENT_APP_SCREENS.CHORD_BOARD,
      session,
      practice: null,
      chordBoard:
        createChordBoardViewModel(item),
      syncState: currentSyncState,
      student08: student08Enabled,
    });
    return state;
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
        student08: student08Enabled,
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
        student08: student08Enabled,
      });
      return state;
    },

    showPublicPool() {
      const session = requireCurrentSession();
      const requestGeneration = sessionGeneration;
      const result = student08Enabled
        ? student08ReadService.listPoolItems({ session })
        : sharingService.listPublicPool({ session });

      return resolveMaybe(result, (items) => {
        if (!sessionRequestIsCurrent(session, requestGeneration)) {
          return state;
        }

        clearActivePractice();
        state = freezeState({
          screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
          session,
          items: student08Enabled
            ? items.map(toPoolSummary)
            : items.map(toWorkSummary),
          syncState: currentSyncState,
          student08: student08Enabled,
        });
        return state;
      });
    },

    openPoolItem(poolItemId) {
      if (!student08Enabled) {
        throw new Error("pool detail unavailable");
      }

      const session = requireCurrentSession();
      const requestGeneration = sessionGeneration;
      const result = student08ReadService.getPoolItem({
        session,
        poolItemId,
      });

      return resolveMaybe(result, (item) => {
        if (!sessionRequestIsCurrent(session, requestGeneration)) {
          return state;
        }

        clearActivePractice();
        state = freezeState({
          screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
          session,
          items: state.items,
          poolDetail: toPoolDetail(item),
          syncState: currentSyncState,
          student08: true,
        });
        return state;
      });
    },

    showMyWork(
      assignmentState = ASSIGNMENT_STATES.ACTIVE,
    ) {
      const session = requireCurrentSession();
      const requestGeneration = sessionGeneration;

      if (
        student08Enabled &&
        !Object.values(ASSIGNMENT_STATES).includes(assignmentState)
      ) {
        throw new TypeError("assignment state is invalid");
      }

      const result = student08Enabled
        ? student08ReadService.listAssignments({
            session,
            state: assignmentState,
          })
        : sharingService.listMyWork({ session });

      return resolveMaybe(result, (items) => {
        if (!sessionRequestIsCurrent(session, requestGeneration)) {
          return state;
        }

        clearActivePractice();
        state = freezeState({
          screen: STUDENT_APP_SCREENS.MY_WORK,
          session,
          items: student08Enabled
            ? items.map(toAssignmentSummary)
            : items.map(toWorkSummary),
          syncState: currentSyncState,
          student08: student08Enabled,
          assignmentState: student08Enabled
            ? assignmentState
            : undefined,
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

      return resolveMaybe(result, (item) =>
        activatePracticeItem({
          item,
          session,
          requestGeneration,
        }),
      );
    },

    openAssignment(assignmentId) {
      if (!student08Enabled) {
        throw new Error("assignment unavailable");
      }

      const session = requireCurrentSession();
      const requestGeneration = sessionGeneration;
      const assignmentResult = student08ReadService.getAssignment({
        session,
        assignmentId,
      });

      return resolveMaybe(assignmentResult, (assignment) => {
        if (!sessionRequestIsCurrent(session, requestGeneration)) {
          return state;
        }

        if (
          assignment.practiceType ===
          PRACTICE_TYPES.CHORD_BOARD
        ) {
          const itemResult =
            student08ReadService
              .getChordBoardPracticeItem({
                session,
                assignmentId,
              });

          return resolveMaybe(
            itemResult,
            (item) =>
              activateChordBoardItem({
                item,
                session,
                requestGeneration,
              }),
          );
        }

        if (assignment.practiceType !== PRACTICE_TYPES.SCORE) {
          throw new Error("assignment type unavailable");
        }

        const itemResult = student08ReadService.getScorePracticeItem({
          session,
          assignmentId,
        });

        return resolveMaybe(itemResult, (item) =>
          activatePracticeItem({
            item,
            session,
            requestGeneration,
          }),
        );
      });
    },

    recoverActivePracticePlayback() {
      if (
        state.screen !==
          STUDENT_APP_SCREENS.PRACTICE ||
        state.practice === null ||
        activePracticePackage === null ||
        typeof playbackPort?.preparePackage !==
          "function"
      ) {
        return state;
      }

      const pkg = activePracticePackage;
      const packageId = pkg.packageId;
      const result =
        playbackPort.preparePackage(pkg);

      const applyRecovery = (ready) => {
        if (
          ready !== true ||
          state.screen !==
            STUDENT_APP_SCREENS.PRACTICE ||
          state.practice === null ||
          activePracticePackage !== pkg ||
          state.practice.packageId !== packageId
        ) {
          return state;
        }

        let practice =
          withPracticeCapability(
            state.practice,
            "playback",
            playbackPort.canPlayPackage?.(pkg) === true
              ? PRACTICE_CAPABILITY_STATES.AVAILABLE
              : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
          );

        practice =
          withPracticeCapability(
            practice,
            "tempoChange",
            playbackPort
              .canChangeTempoForPackage?.(pkg) === true
              ? PRACTICE_CAPABILITY_STATES.AVAILABLE
              : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
          );

        practice =
          withPracticeCapability(
            practice,
            "measureRepeat",
            playbackPort
              .canRepeatMeasureForPackage?.(pkg) === true
              ? PRACTICE_CAPABILITY_STATES.AVAILABLE
              : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
          );

        state = freezeState(
          stateArgs({ practice }),
        );
        return state;
      };

      if (
        result !== null &&
        typeof result?.then === "function"
      ) {
        return Promise.resolve(result)
          .then(applyRecovery)
          .catch(() => state);
      }

      return applyRecovery(result);
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
