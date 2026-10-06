import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
import { mountStudentAppPerfA } from "../src/ui/mountStudentAppPerfA.js";
import {
  createStudentPerfAController,
  createStudentPerfAReadService,
} from "../src/ui/studentPerfA.js";

const student = createStudentSession({
  studentId: "student-a",
  displayName: "Ali",
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function poolItem(title = "Havuz eseri") {
  return {
    poolItemId: "pool-1",
    title,
    shortDescription: "",
    publishedAt: "2026-10-06T12:00:00Z",
  };
}

function assignment(
  assignmentId = "assignment-1",
  state = ASSIGNMENT_STATES.ACTIVE,
) {
  return {
    assignmentId,
    title: "Etüt",
    practiceType: PRACTICE_TYPES.SCORE,
    teacherNote: "",
    state,
    assignedAt: "2026-10-06T12:00:00Z",
  };
}

function createPerfAController(service, options = {}) {
  const readService = createStudentPerfAReadService(service);
  const baseController = createStudentAppController({
    sharingService: {},
    student08ReadService: readService,
    initialSession: student,
    ...options,
  });

  return createStudentPerfAController({
    controller: baseController,
    readService,
  });
}

function makeOrderingService() {
  const reads = new Map();

  function read(key) {
    const pending = deferred();
    reads.set(key, pending);
    return pending.promise;
  }

  return {
    reads,
    service: {
      listPieces({ state }) {
        return read(`pieces:${state}`);
      },
      listAssignments({ state }) {
        return read(`assignments:${state}`);
      },
      listPoolItems() {
        return read("pool");
      },
    },
  };
}

function resolveFolder(reads, state, items = []) {
  reads.get(`pieces:${state}`).resolve([]);
  reads.get(`assignments:${state}`).resolve(items);
}

test("SES-192 ACTIVE -> REPERTOIRE -> HAVUZ keeps the newest same-session navigation", async () => {
  const { reads, service } = makeOrderingService();
  const controller = createPerfAController(service);

  const active = controller.showMyWork(ASSIGNMENT_STATES.ACTIVE);
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.equal(controller.getState().assignmentState, ASSIGNMENT_STATES.ACTIVE);

  const repertoire = controller.showMyWork(ASSIGNMENT_STATES.REPERTOIRE);
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.equal(
    controller.getState().assignmentState,
    ASSIGNMENT_STATES.REPERTOIRE,
  );

  const pool = controller.showPublicPool();
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.PUBLIC_POOL);

  reads.get("pool").resolve([poolItem("Güncel Havuz")]);
  await pool;

  resolveFolder(reads, ASSIGNMENT_STATES.REPERTOIRE, [
    assignment("rep-1", ASSIGNMENT_STATES.REPERTOIRE),
  ]);
  await repertoire;
  resolveFolder(reads, ASSIGNMENT_STATES.ACTIVE, [
    assignment("active-1", ASSIGNMENT_STATES.ACTIVE),
  ]);
  await active;

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.PUBLIC_POOL);
  assert.deepEqual(
    controller.getState().items.map((item) => item.title),
    ["Güncel Havuz"],
  );
});

test("SES-192 HAVUZ -> ACTIVE -> COMPLETED keeps the newest same-session navigation", async () => {
  const { reads, service } = makeOrderingService();
  const controller = createPerfAController(service);

  const pool = controller.showPublicPool();
  const active = controller.showMyWork(ASSIGNMENT_STATES.ACTIVE);
  const completed = controller.showMyWork(ASSIGNMENT_STATES.COMPLETED);

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.equal(
    controller.getState().assignmentState,
    ASSIGNMENT_STATES.COMPLETED,
  );

  resolveFolder(reads, ASSIGNMENT_STATES.COMPLETED, [
    assignment("completed-1", ASSIGNMENT_STATES.COMPLETED),
  ]);
  await completed;

  reads.get("pool").resolve([poolItem("Eski Havuz")]);
  await pool;
  resolveFolder(reads, ASSIGNMENT_STATES.ACTIVE, [
    assignment("active-1", ASSIGNMENT_STATES.ACTIVE),
  ]);
  await active;

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.equal(
    controller.getState().assignmentState,
    ASSIGNMENT_STATES.COMPLETED,
  );
  assert.deepEqual(
    controller.getState().items.map((item) => item.assignmentId),
    ["completed-1"],
  );
});

test("SES-192 opening a listed assignment does not refetch assignment metadata", async () => {
  let assignmentReads = 0;
  let scoreReads = 0;
  const service = {
    listPieces() {
      return [];
    },
    listAssignments() {
      return [assignment()];
    },
    getAssignment() {
      assignmentReads += 1;
      return assignment();
    },
    getScorePracticeItem() {
      scoreReads += 1;
      return Promise.reject(new Error("stop after exact practice read"));
    },
  };
  const controller = createPerfAController(service);

  await controller.showMyWork(ASSIGNMENT_STATES.ACTIVE);
  await assert.rejects(
    controller.openAssignment("assignment-1"),
    /stop after exact practice read/,
  );

  assert.equal(assignmentReads, 0);
  assert.equal(scoreReads, 1);
});

test("SES-192 Piece open reuses the already validated Piece identity", async () => {
  let specializedPieceReads = 0;
  let scoreReads = 0;
  let chordReads = 0;
  const piece = {
    pieceAssignmentId: "piece-1",
    pieceId: "work-1",
    arrangementId: "arr-1",
    title: "Piece",
    teacherNote: "",
    state: ASSIGNMENT_STATES.ACTIVE,
    assignedAt: "2026-10-06T12:00:00Z",
    contentRefs: {
      scoreAssignmentId: "score-1",
      chordAssignmentIds: ["chord-1"],
    },
  };
  const service = {
    getPiece() {
      return piece;
    },
    getPieceScoreItem() {
      specializedPieceReads += 1;
      return Promise.reject(new Error("legacy score path"));
    },
    listPieceChordItems() {
      specializedPieceReads += 1;
      return Promise.reject(new Error("legacy chord path"));
    },
    getScorePracticeItem() {
      scoreReads += 1;
      return Promise.reject(new Error("score unavailable"));
    },
    getChordBoardPracticeItem() {
      chordReads += 1;
      return Promise.reject(new Error("chord unavailable"));
    },
  };
  const controller = createPerfAController(service);

  await assert.rejects(
    controller.openPiece("piece-1", {
      folderState: ASSIGNMENT_STATES.ACTIVE,
      scrollPosition: 0,
    }),
    /Piece content unavailable/,
  );

  assert.equal(specializedPieceReads, 0);
  assert.equal(scoreReads, 1);
  assert.equal(chordReads, 1);
});

function makeMountRoot() {
  let markup = "";
  const captureClickHandlers = [];
  const bubbleClickHandlers = [];
  const statusNode = { textContent: "" };

  const root = {
    ownerDocument: {
      activeElement: null,
      defaultView: {
        innerWidth: 390,
        scrollY: 0,
        queueMicrotask,
      },
    },
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
      statusNode.textContent = "";
    },
    addEventListener(type, handler, capture = false) {
      if (type === "click") {
        (capture ? captureClickHandlers : bubbleClickHandlers).push(handler);
      }
    },
    removeEventListener(type, handler, capture = false) {
      if (type !== "click") {
        return;
      }
      const handlers = capture ? captureClickHandlers : bubbleClickHandlers;
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    },
    contains() {
      return true;
    },
    querySelector(selector) {
      return selector === ".app-status" ? statusNode : null;
    },
    querySelectorAll() {
      return [];
    },
  };

  return {
    root,
    statusText() {
      return statusNode.textContent;
    },
    click(action, dataset = {}) {
      const target = {
        dataset: { action, ...dataset },
        closest(selector) {
          return selector === "[data-action]" ? this : null;
        },
      };
      const event = { target };
      for (const handler of [...captureClickHandlers]) {
        handler(event);
      }
      const results = bubbleClickHandlers.map((handler) => handler(event));
      return Promise.all(results);
    },
  };
}

test("SES-192 folder destination paints before its async list read completes", async () => {
  const assignments = deferred();
  let notationRenderCalls = 0;
  const controller = createPerfAController(
    {
      listPieces() {
        return [];
      },
      listAssignments() {
        return assignments.promise;
      },
    },
    {
      notationAdapter: {
        isAvailable() {
          return true;
        },
      },
    },
  );
  const fixture = makeMountRoot();
  const mounted = mountStudentAppPerfA({
    root: fixture.root,
    controller,
    notationAdapter: {
      isAvailable() {
        return true;
      },
      async render() {
        notationRenderCalls += 1;
        return { capability: "AVAILABLE" };
      },
      async dispose() {},
    },
  });

  const action = fixture.click("show-work-folder", {
    assignmentState: ASSIGNMENT_STATES.ACTIVE,
  });
  await Promise.resolve();

  assert.match(fixture.root.innerHTML, /Benim Çalışmalarım/);
  assert.equal(fixture.statusText(), "Yükleniyor…");
  assert.equal(notationRenderCalls, 0);

  assignments.resolve([]);
  await action;

  assert.equal(fixture.statusText(), "");
  assert.equal(notationRenderCalls, 0);
  await mounted.destroy();
});
