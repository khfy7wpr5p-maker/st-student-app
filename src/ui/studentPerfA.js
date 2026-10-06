import { ASSIGNMENT_STATES } from "../contracts/privateAssignment.js";
import { STUDENT_APP_SCREENS } from "./studentAppController.js";

const STALE_NAVIGATION_CODE = "STUDENT_PERF_A_STALE_NAVIGATION";

function staleNavigationError() {
  const error = new Error("navigation superseded");
  error.code = STALE_NAVIGATION_CODE;
  return error;
}

export function isStudentPerfAStaleNavigation(error) {
  return error?.code === STALE_NAVIGATION_CODE;
}

function studentIdOf(session) {
  return typeof session?.studentId === "string" ? session.studentId : null;
}

function sameStudentAndState(left, right) {
  return (
    left !== null &&
    right !== null &&
    left.studentId === right.studentId &&
    left.state === right.state
  );
}

function markPromiseHandled(result) {
  if (result !== null && typeof result?.then === "function") {
    Promise.resolve(result).catch(() => {});
  }
  return result;
}

export function createStudentPerfAReadService(readService) {
  if (readService === null || typeof readService !== "object") {
    return null;
  }

  let navigationGeneration = 0;
  let myWorkPair = null;
  let listedAssignmentRead = null;
  let assignmentCache = new Map();
  let pieceOpen = null;

  function invalidateNavigation() {
    navigationGeneration += 1;
    myWorkPair = null;
  }

  function beginNavigation() {
    invalidateNavigation();
    return navigationGeneration;
  }

  function assertNavigationCurrent(generation) {
    if (generation !== navigationGeneration) {
      throw staleNavigationError();
    }
  }

  async function listPieces(args = {}) {
    const token = beginNavigation();
    myWorkPair = {
      token,
      studentId: studentIdOf(args.session),
      state: args.state,
    };
    const value = await readService.listPieces(args);
    assertNavigationCurrent(token);
    return value;
  }

  async function listAssignments(args = {}) {
    const requested = {
      studentId: studentIdOf(args.session),
      state: args.state,
    };
    const token =
      myWorkPair !== null &&
      myWorkPair.token === navigationGeneration &&
      sameStudentAndState(myWorkPair, requested)
        ? myWorkPair.token
        : beginNavigation();

    myWorkPair = null;
    const value = await readService.listAssignments(args);
    assertNavigationCurrent(token);

    if (Array.isArray(value)) {
      const next = new Map();
      for (const item of value) {
        if (typeof item?.assignmentId === "string") {
          next.set(item.assignmentId, item);
        }
      }
      assignmentCache = next;
    }

    return value;
  }

  async function listPoolItems(args = {}) {
    const token = beginNavigation();
    const value = await readService.listPoolItems(args);
    assertNavigationCurrent(token);
    return value;
  }

  async function listSharedWorkRequests(args = {}) {
    const token = beginNavigation();
    const value = await readService.listSharedWorkRequests(args);
    assertNavigationCurrent(token);
    return value;
  }

  function prepareListedAssignmentRead({ session, assignmentId } = {}) {
    const id =
      typeof assignmentId === "string" ? assignmentId.trim() : "";
    const cached = assignmentCache.get(id) ?? null;
    listedAssignmentRead =
      cached === null
        ? null
        : {
            studentId: studentIdOf(session),
            assignmentId: id,
            value: cached,
          };
  }

  function getAssignment(args = {}) {
    const id =
      typeof args.assignmentId === "string" ? args.assignmentId.trim() : "";
    const prepared = listedAssignmentRead;
    listedAssignmentRead = null;

    if (
      prepared !== null &&
      prepared.studentId === studentIdOf(args.session) &&
      prepared.assignmentId === id
    ) {
      return prepared.value;
    }

    return readService.getAssignment(args);
  }

  function beginPieceOpen({ session, pieceAssignmentId } = {}) {
    const token = Symbol("student-perf-a-piece-open");
    pieceOpen = {
      token,
      studentId: studentIdOf(session),
      pieceAssignmentId,
      piece: null,
    };
    return token;
  }

  function endPieceOpen(token) {
    if (pieceOpen?.token === token) {
      pieceOpen = null;
    }
  }

  async function getPiece(args = {}) {
    const value = await readService.getPiece(args);
    if (
      pieceOpen !== null &&
      pieceOpen.studentId === studentIdOf(args.session) &&
      pieceOpen.pieceAssignmentId === args.pieceAssignmentId &&
      value?.pieceAssignmentId === args.pieceAssignmentId
    ) {
      pieceOpen.piece = value;
    }
    return value;
  }

  function reusablePiece(args = {}) {
    if (
      pieceOpen === null ||
      pieceOpen.piece === null ||
      pieceOpen.studentId !== studentIdOf(args.session) ||
      pieceOpen.pieceAssignmentId !== args.pieceAssignmentId ||
      pieceOpen.piece.pieceAssignmentId !== args.pieceAssignmentId
    ) {
      return null;
    }
    return pieceOpen.piece;
  }

  async function getPieceScoreItem(args = {}) {
    const piece = reusablePiece(args);
    const assignmentId = piece?.contentRefs?.scoreAssignmentId ?? null;

    if (
      piece !== null &&
      typeof assignmentId === "string" &&
      typeof readService.getScorePracticeItem === "function"
    ) {
      return readService.getScorePracticeItem({
        session: args.session,
        assignmentId,
      });
    }

    return readService.getPieceScoreItem(args);
  }

  async function listPieceChordItems(args = {}) {
    const piece = reusablePiece(args);
    const assignmentIds = piece?.contentRefs?.chordAssignmentIds ?? null;

    if (
      piece !== null &&
      Array.isArray(assignmentIds) &&
      typeof readService.getChordBoardPracticeItem === "function"
    ) {
      const items = [];
      for (const assignmentId of assignmentIds) {
        items.push(
          await readService.getChordBoardPracticeItem({
            session: args.session,
            assignmentId,
          }),
        );
      }
      return Object.freeze(items);
    }

    return readService.listPieceChordItems(args);
  }

  function clearPresentationCache() {
    assignmentCache = new Map();
    listedAssignmentRead = null;
    pieceOpen = null;
  }

  const wrapped = {
    ...readService,
    listPoolItems: (...args) => markPromiseHandled(listPoolItems(...args)),
    listAssignments: (...args) => markPromiseHandled(listAssignments(...args)),
    getAssignment,
  };

  if (typeof readService.listPieces === "function") {
    wrapped.listPieces = (...args) => markPromiseHandled(listPieces(...args));
  }
  if (typeof readService.listSharedWorkRequests === "function") {
    wrapped.listSharedWorkRequests = (...args) =>
      markPromiseHandled(listSharedWorkRequests(...args));
  }
  if (typeof readService.getPiece === "function") {
    wrapped.getPiece = getPiece;
  }
  if (typeof readService.getPieceScoreItem === "function") {
    wrapped.getPieceScoreItem = getPieceScoreItem;
  }
  if (typeof readService.listPieceChordItems === "function") {
    wrapped.listPieceChordItems = listPieceChordItems;
  }

  Object.defineProperties(wrapped, {
    __studentPerfAInvalidateNavigation: {
      value: invalidateNavigation,
      enumerable: false,
    },
    __studentPerfAPrepareListedAssignmentRead: {
      value: prepareListedAssignmentRead,
      enumerable: false,
    },
    __studentPerfABeginPieceOpen: {
      value: beginPieceOpen,
      enumerable: false,
    },
    __studentPerfAEndPieceOpen: {
      value: endPieceOpen,
      enumerable: false,
    },
    __studentPerfAClearPresentationCache: {
      value: clearPresentationCache,
      enumerable: false,
    },
  });

  return Object.freeze(wrapped);
}

function freezePendingState(current, screen, extra = {}) {
  const pending = {
    screen,
    session: current.session,
    items: Object.freeze([]),
    practice: null,
    chordBoard: null,
  };

  if (current.syncState !== undefined) {
    pending.syncState = current.syncState;
  }
  if (current.student08 === true) {
    pending.student08 = true;
  }

  return Object.freeze({
    ...pending,
    ...extra,
  });
}

export function createStudentPerfAController({
  controller,
  readService,
} = {}) {
  if (controller === null || typeof controller?.getState !== "function") {
    throw new TypeError("student controller required");
  }

  let pendingState = null;
  let uiGeneration = 0;

  const getState = () => pendingState ?? controller.getState();

  function invalidatePending() {
    uiGeneration += 1;
    pendingState = null;
    readService?.__studentPerfAInvalidateNavigation?.();
  }

  function navigate({ screen, extra, operation }) {
    const generation = uiGeneration + 1;
    uiGeneration = generation;
    controller.disposeActivePractice?.();
    pendingState = freezePendingState(
      getState(),
      screen,
      extra,
    );

    let result;
    try {
      result = operation();
    } catch (error) {
      if (isStudentPerfAStaleNavigation(error)) {
        return Promise.resolve(getState());
      }
      throw error;
    }

    return Promise.resolve(result)
      .then(() => {
        if (generation === uiGeneration) {
          pendingState = null;
        }
        return getState();
      })
      .catch((error) => {
        if (isStudentPerfAStaleNavigation(error)) {
          return getState();
        }
        throw error;
      });
  }

  function invalidateAndCall(name, args) {
    invalidatePending();
    return controller[name](...args);
  }

  const wrapped = {
    ...controller,
    getState,

    isNavigationPending() {
      return pendingState !== null;
    },

    getPracticeRenderSource() {
      return pendingState === null
        ? controller.getPracticeRenderSource()
        : null;
    },

    getScoreFollowSource() {
      return pendingState === null
        ? controller.getScoreFollowSource?.() ?? null
        : null;
    },

    showPublicPool() {
      return navigate({
        screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
        operation: () => controller.showPublicPool(),
      });
    },

    showMyWork(
      assignmentState = ASSIGNMENT_STATES.ACTIVE,
    ) {
      return navigate({
        screen: STUDENT_APP_SCREENS.MY_WORK,
        extra: { assignmentState },
        operation: () => controller.showMyWork(assignmentState),
      });
    },

    showSharedRequestPool() {
      return navigate({
        screen: STUDENT_APP_SCREENS.SHARED_REQUEST_POOL,
        operation: () => controller.showSharedRequestPool(),
      });
    },

    openAssignment(assignmentId) {
      const session = getState().session;
      invalidatePending();
      readService?.__studentPerfAPrepareListedAssignmentRead?.({
        session,
        assignmentId,
      });
      return controller.openAssignment(assignmentId);
    },

    openPiece(pieceAssignmentId, returnContext = {}) {
      const session = getState().session;
      invalidatePending();
      const token =
        readService?.__studentPerfABeginPieceOpen?.({
          session,
          pieceAssignmentId,
        }) ?? null;

      try {
        const result = controller.openPiece(
          pieceAssignmentId,
          returnContext,
        );
        if (result !== null && typeof result?.then === "function") {
          return Promise.resolve(result).finally(() => {
            readService?.__studentPerfAEndPieceOpen?.(token);
          });
        }
        readService?.__studentPerfAEndPieceOpen?.(token);
        return result;
      } catch (error) {
        readService?.__studentPerfAEndPieceOpen?.(token);
        throw error;
      }
    },

    attachSession(...args) {
      invalidatePending();
      readService?.__studentPerfAClearPresentationCache?.();
      return controller.attachSession(...args);
    },

    signOut(...args) {
      invalidatePending();
      readService?.__studentPerfAClearPresentationCache?.();
      return controller.signOut(...args);
    },

    showHome(...args) {
      return invalidateAndCall("showHome", args);
    },

    showWorkRequestForm(...args) {
      return invalidateAndCall("showWorkRequestForm", args);
    },

    openPoolItem(...args) {
      return invalidateAndCall("openPoolItem", args);
    },

    openPractice(...args) {
      return invalidateAndCall("openPractice", args);
    },

    backFromPiece(...args) {
      return invalidateAndCall("backFromPiece", args);
    },
  };

  return Object.freeze(wrapped);
}
