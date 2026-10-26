import test from "node:test";
import assert from "node:assert/strict";
import { createStudentAppController } from "../src/ui/studentAppController.js";
import { createStudentSession } from "../src/auth/session.js";
import { createStudentPerfAController, createStudentPerfAReadService } from "../src/ui/studentPerfA.js";

test("request return folder follows the visible pending folder in production PerfA", async () => {
  const read = deferred();
  const readService = createStudentPerfAReadService({
    listAssignments: ({ state }) => state === "REPERTOIRE" ? read.promise : [],
    requestWork: async () => ({}),
    listSharedWorkRequests: async () => [],
  });
  const base = controller(readService);
  const app = createStudentPerfAController({ controller: base, readService });
  await app.showMyWork("ACTIVE");
  const changingFolder = app.showMyWork("REPERTOIRE");
  assert.equal(app.getState().assignmentState, "REPERTOIRE");
  app.showWorkRequestForm();
  assert.equal(app.getState().workRequestReturnState, "REPERTOIRE");
  read.resolve([]);
  await changingFolder;
  assert.equal(app.getState().screen, "work_request");
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function controller(overrides = {}) {
  return createStudentAppController({
    sharingService: {},
    initialSession: createStudentSession({ studentId: "student-a" }),
    student08ReadService: {
      listAssignments: () => [], listPoolItems: () => [],
      requestWork: async () => ({}), listSharedWorkRequests: async () => [],
      ...overrides,
    },
  });
}

test("inline pending rows preserve the form draft and do not reuse work items", async () => {
  const read = deferred();
  const app = controller({ listSharedWorkRequests: () => read.promise });
  app.showWorkRequestForm();
  const loading = app.loadWorkRequestPool();
  app.setWorkRequestDraft("Fikrimin İnce Gülü");
  read.resolve([{ title: "Etüt", displayNameOrNickname: "Ahmet", studentId: "secret" }]);
  await loading;
  const state = app.getState();
  assert.equal(state.screen, "work_request");
  assert.equal(state.workRequestDraft, "Fikrimin İnce Gülü");
  assert.equal(state.workRequestPoolStatus, "ready");
  assert.deepEqual(state.workRequestItems, [{ title: "Etüt", displayNameOrNickname: "Ahmet" }]);
  assert.deepEqual(state.items, []);
});

test("a pending list cannot repaint a departed or reopened form", async () => {
  const read = deferred();
  const app = controller({ listSharedWorkRequests: () => read.promise });
  app.showWorkRequestForm();
  const loading = app.loadWorkRequestPool();
  app.showHome();
  app.showWorkRequestForm();
  app.setWorkRequestDraft("Yeni form");
  read.resolve([{ title: "Eski", displayNameOrNickname: "Eski" }]);
  await loading;
  assert.equal(app.getState().workRequestDraft, "Yeni form");
  assert.deepEqual(app.getState().workRequestItems, []);
});

test("duplicate submission sends once and preserves success if pending rows fail", async () => {
  const post = deferred();
  let calls = 0;
  const app = controller({ requestWork: () => { calls += 1; return post.promise; }, listSharedWorkRequests: () => Promise.reject(new Error("offline")) });
  app.showWorkRequestForm();
  app.setWorkRequestDraft("Etüt");
  const first = app.submitWorkRequest("Etüt");
  const second = app.submitWorkRequest("Etüt");
  assert.equal(app.getState().workRequestSubmitting, true);
  post.resolve({ title: "Etüt" });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  await app.loadWorkRequestPool();
  assert.equal(app.getState().workRequestStatus, "success");
  assert.equal(app.getState().workRequestSubmitting, false);
  assert.equal(app.getState().workRequestPoolStatus, "error");
});

test("late submission never navigates back from another screen", async () => {
  const post = deferred();
  const app = controller({ requestWork: () => post.promise });
  app.showWorkRequestForm();
  const sending = app.submitWorkRequest("Etüt");
  app.showHome();
  post.resolve({});
  await sending;
  assert.equal(app.getState().screen, "home");
});

test("failed submission keeps the draft and requires an explicit retry", async () => {
  let calls = 0;
  const app = controller({ requestWork: () => { calls++; throw new Error("network"); } });
  app.showWorkRequestForm();
  app.setWorkRequestDraft("Uzun İnce Bir Yoldayım");
  await app.submitWorkRequest("Uzun İnce Bir Yoldayım");
  assert.equal(calls, 1);
  assert.equal(app.getState().workRequestDraft, "Uzun İnce Bir Yoldayım");
  assert.equal(app.getState().workRequestStatus, "error");
  assert.equal(app.getState().workRequestSubmitting, false);
});

test("form remembers its repertoire return folder and isolates account changes", async () => {
  const read = deferred();
  const app = controller({ listSharedWorkRequests: () => read.promise });
  await app.showMyWork("REPERTOIRE");
  app.showWorkRequestForm();
  assert.equal(app.getState().workRequestReturnState, "REPERTOIRE");
  const loading = app.loadWorkRequestPool();
  app.attachSession(createStudentSession({ studentId: "student-b" }));
  app.showWorkRequestForm();
  read.resolve([{ title: "Student A", displayNameOrNickname: "A" }]);
  await loading;
  assert.equal(app.getState().session.studentId, "student-b");
  assert.deepEqual(app.getState().workRequestItems, []);
});
