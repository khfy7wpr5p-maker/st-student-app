import { getAuthenticatedStudentId } from "../auth/session.js";

export const STUDENT_APP_SCREENS = Object.freeze({
  SIGN_IN: "sign_in",
  HOME: "home",
  PUBLIC_POOL: "public_pool",
  MY_WORK: "my_work",
  PRACTICE: "practice",
});

const emptyState = () => ({
  screen: STUDENT_APP_SCREENS.SIGN_IN,
  session: null,
  items: [],
  practice: null,
});

function requireSession(session) {
  if (getAuthenticatedStudentId(session) === null) {
    throw new Error("authenticated student session required");
  }
  return session;
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
    const session = requireSession(initialSession);
    state = {
      screen: STUDENT_APP_SCREENS.HOME,
      session,
      items: [],
      practice: null,
    };
  }

  function requireCurrentSession() {
    return requireSession(state.session);
  }

  return Object.freeze({
    getState() {
      return state;
    },

    attachSession(session) {
      state = {
        screen: STUDENT_APP_SCREENS.HOME,
        session: requireSession(session),
        items: [],
        practice: null,
      };
      return state;
    },

    showHome() {
      requireCurrentSession();
      state = {
        ...state,
        screen: STUDENT_APP_SCREENS.HOME,
        items: [],
        practice: null,
      };
      return state;
    },

    showPublicPool() {
      const session = requireCurrentSession();
      const items = sharingService
        .listPublicPool({ session })
        .map(toWorkSummary);

      state = {
        ...state,
        screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
        items,
        practice: null,
      };
      return state;
    },

    showMyWork() {
      const session = requireCurrentSession();
      const items = sharingService
        .listMyWork({ session })
        .map(toWorkSummary);

      state = {
        ...state,
        screen: STUDENT_APP_SCREENS.MY_WORK,
        items,
        practice: null,
      };
      return state;
    },

    openPractice(publicationId) {
      const session = requireCurrentSession();
      const item = sharingService.getPracticeItem({
        session,
        publicationId,
      });

      state = {
        ...state,
        screen: STUDENT_APP_SCREENS.PRACTICE,
        items: [],
        practice: toPracticeSummary(item),
      };
      return state;
    },

    signOut() {
      state = emptyState();
      return state;
    },
  });
}
