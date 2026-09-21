import { getAuthenticatedStudentId } from "../auth/session.js";

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

function toPracticeSummary(item) {
  return Object.freeze({
    publicationId: item.publication.publicationId,
    packageId: item.package.packageId,
    title: item.package.title,
  });
}

export function createStudentAppController({
  sharingService,
  initialSession = null,
}) {
  let state = emptyState();

  if (initialSession !== null) {
    state = freezeState({
      screen: STUDENT_APP_SCREENS.HOME,
      session: requireSession(initialSession),
    });
  }

  function requireCurrentSession() {
    return requireSession(state.session);
  }

  return Object.freeze({
    getState() {
      return state;
    },

    attachSession(session) {
      state = freezeState({
        screen: STUDENT_APP_SCREENS.HOME,
        session: requireSession(session),
      });
      return state;
    },

    showHome() {
      const session = requireCurrentSession();

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

      state = freezeState({
        screen: STUDENT_APP_SCREENS.PRACTICE,
        session,
        practice: toPracticeSummary(item),
      });
      return state;
    },

    signOut() {
      state = emptyState();
      return state;
    },
  });
}
