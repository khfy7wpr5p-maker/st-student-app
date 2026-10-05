import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { CONNECTIVITY_STATES } from "../src/offline/connectivityPort.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../src/offline/secureDeliveryOfflineReadService.js";
import {
  createSecureDeliveryStudent08ReadService,
} from "../src/sharing/secureDeliveryStudent08ReadService.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";
import { dispatchStudentAppAction } from "../src/ui/shellActions.js";

const sessionA = createStudentSession({ studentId: "student-a" });
const sessionB = createStudentSession({ studentId: "student-b" });

function baseApiClient(overrides = {}) {
  return {
    async listStudentPool() {
      return [];
    },
    async listStudentAssignments() {
      return [];
    },
    async getStudentAssignment() {
      throw new Error("unused");
    },
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("SES-190 Student08 service trims request title and strips shared Havuz authority fields", async () => {
  const calls = [];
  const service = createSecureDeliveryStudent08ReadService({
    apiClient: baseApiClient({
      async requestStudentWork(title) {
        calls.push(["request", title]);
        return {
          requestId: "request-internal",
          studentId: "student-a",
          teacherId: "teacher-a",
          title,
          state: "PENDING",
          requestedAt: "2026-10-05T12:00:00Z",
          updatedAt: "2026-10-05T12:00:00Z",
          targetState: null,
        };
      },
      async listSharedPendingWorkRequests() {
        calls.push(["shared"]);
        return [{
          requestId: "request-internal",
          studentId: "student-a",
          teacherId: "teacher-a",
          title: "Carcassi Op. 60 No. 3",
          displayNameOrNickname: "Ahmet",
        }];
      },
    }),
  });

  const request = await service.requestWork({
    session: sessionA,
    title: "  Carcassi Op. 60 No. 3  ",
  });
  assert.deepEqual(calls[0], ["request", "Carcassi Op. 60 No. 3"]);
  assert.deepEqual(request, {
    title: "Carcassi Op. 60 No. 3",
    state: "PENDING",
    requestedAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
    targetState: null,
  });
  assert.equal(Object.isFrozen(request), true);
  assert.equal("requestId" in request, false);
  assert.equal("studentId" in request, false);
  assert.equal("teacherId" in request, false);

  const shared = await service.listSharedWorkRequests({
    session: sessionA,
  });
  assert.deepEqual(shared, [{
    title: "Carcassi Op. 60 No. 3",
    displayNameOrNickname: "Ahmet",
  }]);
  assert.equal(Object.isFrozen(shared), true);
  assert.equal(Object.isFrozen(shared[0]), true);
  assert.equal("requestId" in shared[0], false);
  assert.equal("studentId" in shared[0], false);
  assert.equal("teacherId" in shared[0], false);

  await assert.rejects(
    () => service.requestWork({ session: sessionA, title: "   " }),
    /title must be a non-empty string/i,
  );
});

test("SES-190 Student08 service fails closed on malformed shared rows", async () => {
  const service = createSecureDeliveryStudent08ReadService({
    apiClient: baseApiClient({
      async requestStudentWork(title) {
        return { title, state: "PENDING" };
      },
      async listSharedPendingWorkRequests() {
        return [{
          title: "Carcassi",
          displayNameOrNickname: "   ",
        }];
      },
    }),
  });

  await assert.rejects(
    () => service.listSharedWorkRequests({ session: sessionA }),
    /displayNameOrNickname must be a non-empty string/i,
  );
});

test("SES-190 offline wrapper forwards request/Havuz only while online", async () => {
  let connectivity = CONNECTIVITY_STATES.ONLINE;
  const calls = [];
  const onlineReadService = {
    async listPoolItems() {
      return [];
    },
    async getPoolItem() {
      throw new Error("unused");
    },
    async listAssignments() {
      return [];
    },
    async getAssignment() {
      throw new Error("unused");
    },
    async getScorePracticeItem() {
      throw new Error("unused");
    },
    async getChordBoardPracticeItem() {
      throw new Error("unused");
    },
    async requestWork({ title }) {
      calls.push(["request", title]);
      return Object.freeze({ title, state: "PENDING" });
    },
    async listSharedWorkRequests() {
      calls.push(["shared"]);
      return Object.freeze([
        Object.freeze({
          title: "Carcassi",
          displayNameOrNickname: "Ahmet",
        }),
      ]);
    },
  };
  const service = createSecureDeliveryOfflineReadService({
    onlineReadService,
    offlineRepository: {
      async putAuthorized() {},
      async getActiveByAccessRef() {
        return null;
      },
    },
    connectivityPort: {
      getState() {
        return connectivity;
      },
    },
  });

  assert.equal(
    (await service.requestWork({ session: sessionA, title: "Carcassi" })).title,
    "Carcassi",
  );
  assert.equal(
    (await service.listSharedWorkRequests({ session: sessionA }))[0]
      .displayNameOrNickname,
    "Ahmet",
  );
  assert.deepEqual(calls, [["request", "Carcassi"], ["shared"]]);

  connectivity = CONNECTIVITY_STATES.OFFLINE;
  await assert.rejects(
    () => service.requestWork({ session: sessionA, title: "Carcassi" }),
    /unavailable offline/i,
  );
  await assert.rejects(
    () => service.listSharedWorkRequests({ session: sessionA }),
    /unavailable offline/i,
  );
});

test("SES-190 controller exposes request form, success state, shared Havuz, and ignores stale shared reads", async () => {
  const calls = [];
  const pending = deferred();
  let deferShared = false;
  const student08ReadService = {
    listPoolItems() {
      return [];
    },
    listAssignments() {
      return [];
    },
    requestWork({ session, title }) {
      calls.push(["requestWork", session.studentId, title]);
      return Promise.resolve(Object.freeze({ title, state: "PENDING" }));
    },
    listSharedWorkRequests({ session }) {
      calls.push(["listSharedWorkRequests", session.studentId]);
      if (deferShared) {
        return pending.promise;
      }
      return Promise.resolve(Object.freeze([
        Object.freeze({
          title: "Carcassi Op. 60 No. 3",
          displayNameOrNickname: "Ahmet",
        }),
      ]));
    },
  };
  const controller = createStudentAppController({
    sharingService: {
      listPublicPool() {
        return [];
      },
      listMyWork() {
        return [];
      },
    },
    student08ReadService,
    initialSession: sessionA,
  });

  controller.showWorkRequestForm();
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.WORK_REQUEST);
  assert.equal(controller.getState().workRequestStatus, null);

  await controller.submitWorkRequest("  Carcassi Op. 60 No. 3  ");
  assert.deepEqual(calls[0], [
    "requestWork",
    "student-a",
    "Carcassi Op. 60 No. 3",
  ]);
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.WORK_REQUEST);
  assert.equal(controller.getState().workRequestStatus, "success");

  await controller.showSharedRequestPool();
  assert.equal(
    controller.getState().screen,
    STUDENT_APP_SCREENS.SHARED_REQUEST_POOL,
  );
  assert.deepEqual(controller.getState().items, [{
    title: "Carcassi Op. 60 No. 3",
    displayNameOrNickname: "Ahmet",
  }]);

  deferShared = true;
  const staleRead = controller.showSharedRequestPool();
  controller.attachSession(sessionB);
  pending.resolve(Object.freeze([
    Object.freeze({ title: "Eski", displayNameOrNickname: "Eski öğrenci" }),
  ]));
  await staleRead;
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.HOME);
  assert.equal(controller.getState().session.studentId, "student-b");
  assert.deepEqual(controller.getState().items, []);
});

test("SES-190 renderer keeps controls compact, accessible, escaped, and read-only", () => {
  const workHtml = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.MY_WORK,
    session: { studentId: "student-a" },
    assignmentState: "ACTIVE",
    items: [],
    practice: null,
  });
  assert.match(workHtml, /data-action="show-work-request"[^>]*>Eser İste</);
  assert.match(workHtml, /data-action="show-shared-request-pool"[^>]*>Havuz</);
  assert.match(workHtml, /Aktif Çalışmalar/);
  assert.match(workHtml, /Repertuarım/);

  const formHtml = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.WORK_REQUEST,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    workRequestStatus: "success",
  });
  assert.match(formHtml, /Eser adı/);
  assert.match(formHtml, /data-work-request-title/);
  assert.match(formHtml, /data-action="submit-work-request"[^>]*>Gönder</);
  assert.match(formHtml, /role="status"[^>]*aria-live="polite"/);
  assert.match(formHtml, /İsteğiniz öğretmeninize gönderildi\./);

  const sharedHtml = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.SHARED_REQUEST_POOL,
    session: { studentId: "student-a" },
    items: [{
      title: "<script>Carcassi</script>",
      displayNameOrNickname: "<b>Ahmet</b>",
      requestId: "request-secret",
      studentId: "student-secret",
      teacherId: "teacher-secret",
    }],
    practice: null,
  });
  assert.match(sharedHtml, /&lt;script&gt;Carcassi&lt;\/script&gt;/);
  assert.match(sharedHtml, /&lt;b&gt;Ahmet&lt;\/b&gt;/);
  assert.doesNotMatch(sharedHtml, /request-secret|student-secret|teacher-secret/);
  assert.doesNotMatch(sharedHtml, /Aktife Al|Repertuara Al|Kaldır/);
  assert.doesNotMatch(sharedHtml, /data-request-id|data-student-id|data-teacher-id/);
});

test("SES-190 shell actions forward only bounded request title and navigation intent", async () => {
  const calls = [];
  const controller = {
    showWorkRequestForm() {
      calls.push(["showWorkRequestForm"]);
    },
    submitWorkRequest(title) {
      calls.push(["submitWorkRequest", title]);
    },
    showSharedRequestPool() {
      calls.push(["showSharedRequestPool"]);
    },
  };

  await dispatchStudentAppAction({
    action: "show-work-request",
    controller,
  });
  await dispatchStudentAppAction({
    action: "submit-work-request",
    workRequestTitle: "  Carcassi  ",
    controller,
  });
  await dispatchStudentAppAction({
    action: "show-shared-request-pool",
    controller,
  });

  assert.deepEqual(calls, [
    ["showWorkRequestForm"],
    ["submitWorkRequest", "Carcassi"],
    ["showSharedRequestPool"],
  ]);
});