import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  CONNECTIVITY_STATES,
} from "../src/offline/connectivityPort.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../src/offline/secureDeliveryOfflineReadService.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { mountStudentApp } from "../src/ui/mountStudentApp.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";

const session = createStudentSession({
  studentId: "firebase-uid-a",
});

function mutableConnectivity(
  initial = CONNECTIVITY_STATES.ONLINE,
) {
  let state = initial;
  const listeners = new Set();

  return {
    port: {
      getState() {
        return state;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    emit(next) {
      state = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
}

function assignmentView(
  assignmentId = "assignment-a",
) {
  return Object.freeze({
    assignmentId,
    title: "Gitar Etüdü",
    practiceType: "SCORE",
    teacherNote: "Yavaş çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    sourceRef: Object.freeze({
      sourceKind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
  });
}

function practiceItem(
  assignmentId = "assignment-a",
) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    package: makeApprovedPracticePackage({
      packageId: "pkg-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  });
}

test("S08-4B offline matrix: warm ONLINE cache keeps My Work SCORE readable OFFLINE without network fallback", async () => {
  const connectivity = mutableConnectivity();
  const offlineRepository =
    createInMemoryOfflineRepository();
  const calls = [];

  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService: {
        async listPoolItems() {
          calls.push("pool-list");
          return [];
        },
        async getPoolItem() {
          calls.push("pool-detail");
          throw new Error("unused");
        },
        async listAssignments() {
          calls.push("assignment-list");
          return [assignmentView()];
        },
        async getAssignment({
          assignmentId,
        }) {
          calls.push("assignment-detail");
          return assignmentView(
            assignmentId,
          );
        },
        async getScorePracticeItem({
          assignmentId,
        }) {
          calls.push("practice");
          return practiceItem(
            assignmentId,
          );
        },
      },
      offlineRepository,
      connectivityPort:
        connectivity.port,
      clock: () =>
        "2026-09-23T12:00:00Z",
    });

  await service.listAssignments({
    session,
    state: "ACTIVE",
  });
  const onlinePractice =
    await service.getScorePracticeItem({
      session,
      assignmentId: "assignment-a",
    });

  assert.deepEqual(
    onlinePractice.offlineAvailability,
    {
      source: "online",
      deviceAvailable: true,
      saveFailed: false,
    },
  );

  const callsAtDisconnect =
    calls.length;
  connectivity.emit(
    CONNECTIVITY_STATES.OFFLINE,
  );

  const assignments =
    await service.listAssignments({
      session,
      state: "ACTIVE",
    });
  const assignment =
    await service.getAssignment({
      session,
      assignmentId: "assignment-a",
    });
  const offlinePractice =
    await service.getScorePracticeItem({
      session,
      assignmentId: "assignment-a",
    });

  assert.equal(
    assignments.length,
    1,
  );
  assert.equal(
    assignment.assignmentId,
    "assignment-a",
  );
  assert.equal(
    offlinePractice.package.packageId,
    "pkg-a",
  );
  assert.deepEqual(
    offlinePractice.offlineAvailability,
    {
      source: "offline",
      deviceAvailable: true,
      saveFailed: false,
    },
  );
  assert.equal(
    calls.length,
    callsAtDisconnect,
  );
});

test("S08-4B offline matrix: cold OFFLINE stays bounded and never invents Pool or SCORE data", async () => {
  const connectivity =
    mutableConnectivity(
      CONNECTIVITY_STATES.OFFLINE,
    );
  let onlineCalls = 0;

  const onlineMustNotRun =
    async () => {
      onlineCalls += 1;
      throw new Error(
        "online must not run",
      );
    };

  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService: {
        listPoolItems:
          onlineMustNotRun,
        getPoolItem:
          onlineMustNotRun,
        listAssignments:
          onlineMustNotRun,
        getAssignment:
          onlineMustNotRun,
        getScorePracticeItem:
          onlineMustNotRun,
      },
      offlineRepository:
        createInMemoryOfflineRepository(),
      connectivityPort:
        connectivity.port,
    });

  assert.deepEqual(
    await service.listAssignments({
      session,
      state: "ACTIVE",
    }),
    [],
  );
  await assert.rejects(
    () =>
      service.listPoolItems({
        session,
      }),
    /Pool unavailable offline/i,
  );
  await assert.rejects(
    () =>
      service.getScorePracticeItem({
        session,
        assignmentId:
          "assignment-a",
      }),
    /offline practice unavailable/i,
  );
  assert.equal(
    onlineCalls,
    0,
  );
});

test("S08-4B offline matrix: online cache-save failure never blocks SCORE opening and remains bounded", async () => {
  const connectivity =
    mutableConnectivity();
  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService: {
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
        async getScorePracticeItem({
          assignmentId,
        }) {
          return practiceItem(
            assignmentId,
          );
        },
      },
      offlineRepository: {
        async putAuthorized() {
          throw new Error(
            "indexeddb quota provider detail",
          );
        },
        async getActiveByAccessRef() {
          return null;
        },
      },
      connectivityPort:
        connectivity.port,
    });

  const item =
    await service.getScorePracticeItem({
      session,
      assignmentId:
        "assignment-a",
    });

  assert.equal(
    item.package.packageId,
    "pkg-a",
  );
  assert.deepEqual(
    item.offlineAvailability,
    {
      source: "online",
      deviceAvailable: false,
      saveFailed: true,
    },
  );
  assert.equal(
    JSON.stringify(item).includes(
      "indexeddb quota",
    ),
    false,
  );
});

function makeMountRoot() {
  return {
    innerHTML: "",
    ownerDocument: {
      activeElement: null,
    },
    addEventListener() {},
    removeEventListener() {},
    contains() {
      return true;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function homeState() {
  return {
    screen:
      STUDENT_APP_SCREENS.HOME,
    session: {
      studentId: "student-a",
    },
    items: [],
    practice: null,
  };
}

test("S08-4B reconnect matrix: ONLINE transition completes sync before playback recovery", async () => {
  const connectivity =
    mutableConnectivity(
      CONNECTIVITY_STATES.OFFLINE,
    );
  const order = [];

  const mounted = mountStudentApp({
    root: makeMountRoot(),
    controller: {
      getState: homeState,
      getPracticeRenderSource() {
        return null;
      },
      async synchronizeOffline() {
        order.push("sync:start");
        await Promise.resolve();
        order.push("sync:end");
      },
      async recoverActivePracticePlayback() {
        order.push("recover");
      },
    },
    connectivityPort:
      connectivity.port,
  });

  await mounted.render();
  connectivity.emit(
    CONNECTIVITY_STATES.ONLINE,
  );
  await new Promise(
    (resolve) => setTimeout(resolve, 0),
  );
  await mounted.render();

  assert.deepEqual(order, [
    "sync:start",
    "sync:end",
    "recover",
  ]);

  await mounted.destroy();
});

test("S08-4B reconnect matrix: transient sync failure still attempts bounded playback recovery", async () => {
  const connectivity =
    mutableConnectivity(
      CONNECTIVITY_STATES.OFFLINE,
    );
  let recoverCalls = 0;

  const mounted = mountStudentApp({
    root: makeMountRoot(),
    controller: {
      getState: homeState,
      getPracticeRenderSource() {
        return null;
      },
      async synchronizeOffline() {
        throw new Error(
          "transient provider failure",
        );
      },
      async recoverActivePracticePlayback() {
        recoverCalls += 1;
      },
    },
    connectivityPort:
      connectivity.port,
  });

  await mounted.render();
  connectivity.emit(
    CONNECTIVITY_STATES.ONLINE,
  );
  await new Promise(
    (resolve) => setTimeout(resolve, 0),
  );
  await mounted.render();

  assert.equal(
    recoverCalls,
    1,
  );

  await mounted.destroy();
});
