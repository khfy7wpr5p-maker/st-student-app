import { getAuthenticatedStudentId } from "../auth/session.js";
import { PRACTICE_CAPABILITY_STATES } from "../practice/practiceCapabilities.js";
import {
  createPracticeWorkspace,
  withNotationCapability,
  withPracticeCapability,
} from "../practice/practiceWorkspace.js";

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
}) {
  return Object.freeze({
    screen,
    session,
    items: Object.freeze([...items]),
    practice,
  });
}

const emptyState = () =>
  freezeState({
    screen: STUDENT_APP_SCREENS.SIGN_IN,
  });

function requireSession(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("authenticated student session required");
  }

  return Object.freeze({ studentId });
}

function toWorkSummary(item) {
  return Object.freeze({
    publicationId: item.publication.publicationId,
    packageId: item.package.packageId,
    title: item.package.title,
  });
}

export function createStudentAppController({
  sharingService,
  initialSession = null,
  notationAdapter = null,
  playbackPort = null,
}) {
  let state = emptyState();
  let activePracticeRenderSource = null;
  let activePracticePackage = null;

  function clearActivePractice() {
    activePracticeRenderSource = null;
    activePracticePackage = null;
  }

  if (initialSession !== null) {
    state = freezeState({
      screen: STUDENT_APP_SCREENS.HOME,
      session: requireSession(initialSession),
    });
  }

  function requireCurrentSession() {
    return requireSession(state.session);
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

    state = freezeState({
      screen: state.screen,
      session: state.session,
      items: state.items,
      practice: withPracticeCapability(
        state.practice,
        capabilityName,
        capability,
      ),
    });
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

  return Object.freeze({
    getState() {
      return state;
    },

    getPracticeRenderSource() {
      return state.screen === STUDENT_APP_SCREENS.PRACTICE
        ? activePracticeRenderSource
        : null;
    },

    attachSession(session) {
      const nextSession = requireSession(session);
      clearActivePractice();
      state = freezeState({
        screen: STUDENT_APP_SCREENS.HOME,
        session: nextSession,
      });
      return state;
    },

    showHome() {
      const session = requireCurrentSession();
      clearActivePractice();

      state = freezeState({
        screen: STUDENT_APP_SCREENS.HOME,
        session,
      });
      return state;
    },

    showPublicPool() {
      const session = requireCurrentSession();
      const items = sharingService
        .listPublicPool({ session })
        .map(toWorkSummary);

      clearActivePractice();
      state = freezeState({
        screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
        session,
        items,
      });
      return state;
    },

    showMyWork() {
      const session = requireCurrentSession();
      const items = sharingService
        .listMyWork({ session })
        .map(toWorkSummary);

      clearActivePractice();
      state = freezeState({
        screen: STUDENT_APP_SCREENS.MY_WORK,
        session,
        items,
      });
      return state;
    },

    openPractice(publicationId) {
      const session = requireCurrentSession();
      const item = sharingService.getPracticeItem({
        session,
        publicationId,
      });

      const workspace = createPracticeWorkspace({
        deliveryItem: item,
        notationRuntimeAvailable: notationAdapter?.isAvailable?.() === true,
        playbackPort,
      });

      activePracticeRenderSource = workspace.renderSource;
      activePracticePackage = item.package;

      state = freezeState({
        screen: STUDENT_APP_SCREENS.PRACTICE,
        session,
        practice: workspace.viewModel,
      });
      return state;
    },

    setNotationCapability(capability) {
      if (
        state.screen !== STUDENT_APP_SCREENS.PRACTICE ||
        state.practice === null
      ) {
        throw new Error("practice workspace is not active");
      }

      state = freezeState({
        screen: state.screen,
        session: state.session,
        items: state.items,
        practice: withNotationCapability(state.practice, capability),
      });
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
      if (!Number.isFinite(bpm) || bpm <= 0) {
        throw new TypeError("tempo must be a positive finite number");
      }

      const pkg = requirePracticeCapability("tempoChange");
      return runPracticeOperation(
        "tempoChange",
        () => playbackPort.setTempoForPackage(pkg, bpm),
      );
    },

    setMeasureRepeatEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("repeat enabled must be boolean");
      }

      const pkg = requirePracticeCapability("measureRepeat");
      return runPracticeOperation(
        "measureRepeat",
        () =>
          playbackPort.setMeasureRepeatEnabledForPackage(pkg, enabled),
      );
    },

    signOut() {
      clearActivePractice();
      state = emptyState();
      return state;
    },
  });
}
