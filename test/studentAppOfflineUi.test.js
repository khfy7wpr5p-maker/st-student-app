import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { CONNECTIVITY_STATES } from "../src/offline/connectivityPort.js";
import { SYNC_STATES } from "../src/offline/syncCoordinator.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";
import { mountStudentApp } from "../src/ui/mountStudentApp.js";
import {
  makePrivateDelivery,
  makePublicDelivery,
} from "./support/practiceFixtures.js";

const student = createStudentSession({ studentId: "student-a" });

function asyncOfflineAwareService() {
  return {
    async listPublicPool() {
      return [
        Object.freeze({
          ...makePublicDelivery(),
          offlineAvailability: Object.freeze({
            source: "online",
            deviceAvailable: true,
            saveFailed: false,
          }),
        }),
      ];
    },
    async listMyWork() {
      return [
        Object.freeze({
          ...makePrivateDelivery("student-a"),
          offlineAvailability: Object.freeze({
            source: "offline",
            deviceAvailable: true,
            saveFailed: false,
          }),
        }),
      ];
    },
    async getPracticeItem() {
      return Object.freeze({
        ...makePublicDelivery(),
        offlineAvailability: Object.freeze({
          source: "online",
          deviceAvailable: false,
          saveFailed: true,
        }),
      });
    },
  };
}

test("async offline list exposes only bounded device availability metadata", async () => {
  const controller = createStudentAppController({
    sharingService: asyncOfflineAwareService(),
    initialSession: student,
  });

  await controller.showMyWork();
  const state = controller.getState();

  assert.equal(state.screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.deepEqual(state.items, [
    {
      publicationId: "pub-private",
      packageId: "pkg-private",
      title: "Özel Etüt",
      deviceAvailable: true,
    },
  ]);
  assert.equal(JSON.stringify(state).includes("recipientStudentId"), false);
  assert.equal(JSON.stringify(state).includes("score-partwise"), false);
});

test("cache-save failure does not block async Practice or leak backend detail", async () => {
  const controller = createStudentAppController({
    sharingService: asyncOfflineAwareService(),
    initialSession: student,
  });

  await controller.openPractice("pub-a");

  const state = controller.getState();
  assert.equal(state.screen, STUDENT_APP_SCREENS.PRACTICE);
  assert.equal(state.practice.offlineSaveFailed, true);
  assert.equal(state.practice.deviceAvailable, false);
  assert.equal(JSON.stringify(state).includes("indexeddb"), false);
  assert.equal(JSON.stringify(state).includes("score-partwise"), false);
});

test("foreground sync state is bounded in controller state", async () => {
  const controller = createStudentAppController({
    sharingService: asyncOfflineAwareService(),
    initialSession: student,
    syncCoordinator: {
      async sync() {
        return Object.freeze({
          state: SYNC_STATES.SYNC_ERROR,
          checked: 2,
          revoked: 0,
          failed: 1,
          secret: "provider internal detail",
        });
      },
    },
  });

  await controller.synchronizeOffline();

  assert.equal(controller.getState().syncState, SYNC_STATES.SYNC_ERROR);
  assert.equal(
    JSON.stringify(controller.getState()).includes("provider internal detail"),
    false,
  );
});

test("renderer shows textual connectivity, device cache, and bounded save failure", () => {
  const listHtml = renderStudentApp(
    {
      screen: STUDENT_APP_SCREENS.MY_WORK,
      session: { studentId: "student-a" },
      items: [
        {
          publicationId: "pub-private",
          packageId: "pkg-private",
          title: "Özel Etüt",
          deviceAvailable: true,
        },
      ],
      practice: null,
      syncState: SYNC_STATES.IDLE,
    },
    { connectivityState: CONNECTIVITY_STATES.OFFLINE },
  );

  assert.match(listHtml, /Çevrimdışı/);
  assert.match(listHtml, /Cihazda mevcut/);

  const practiceHtml = renderStudentApp(
    {
      screen: STUDENT_APP_SCREENS.PRACTICE,
      session: { studentId: "student-a" },
      items: [],
      syncState: SYNC_STATES.IDLE,
      practice: {
        publicationId: "pub-a",
        packageId: "pkg-a",
        title: "Etüt A",
        offlineSaveFailed: true,
        deviceAvailable: false,
        capabilities: {
          notation: "UNAVAILABLE",
          playback: "UNAVAILABLE",
          tempoChange: "UNAVAILABLE",
          measureRepeat: "UNAVAILABLE",
          guitarTab: "UNAVAILABLE",
          violin: "UNAVAILABLE",
        },
        practice: { tempoBpm: 80 },
      },
    },
    { connectivityState: CONNECTIVITY_STATES.ONLINE },
  );

  assert.match(practiceHtml, /Çevrimiçi/);
  assert.match(practiceHtml, /Çevrimdışı kaydedilemedi/);
  assert.doesNotMatch(practiceHtml, /quota|indexeddb|firebase|token/i);
});

function makeRoot() {
  let clickListener = null;
  return {
    innerHTML: "",
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
    removeEventListener(type, listener) {
      if (type === "click" && clickListener === listener) clickListener = null;
    },
    contains() {
      return true;
    },
    querySelector() {
      return null;
    },
  };
}

function makeConnectivityHarness() {
  let listener = null;
  let state = CONNECTIVITY_STATES.OFFLINE;

  return {
    port: {
      getState() {
        return state;
      },
      subscribe(next) {
        listener = next;
        return () => {
          listener = null;
        };
      },
    },
    emit(next) {
      state = next;
      listener?.(next);
    },
    subscribed() {
      return listener !== null;
    },
  };
}

test("mount synchronizes on online transition and unsubscribes on destroy", async () => {
  const connectivity = makeConnectivityHarness();
  const root = makeRoot();
  let syncCalls = 0;

  const controller = {
    getState() {
      return {
        screen: STUDENT_APP_SCREENS.HOME,
        session: { studentId: "student-a" },
        items: [],
        practice: null,
        syncState: SYNC_STATES.IDLE,
      };
    },
    getPracticeRenderSource() {
      return null;
    },
    async synchronizeOffline() {
      syncCalls += 1;
    },
  };

  const mounted = mountStudentApp({
    root,
    controller,
    connectivityPort: connectivity.port,
  });

  await mounted.render();
  assert.match(root.innerHTML, /Çevrimdışı/);
  assert.equal(connectivity.subscribed(), true);

  connectivity.emit(CONNECTIVITY_STATES.ONLINE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await mounted.render();

  assert.equal(syncCalls, 1);
  assert.match(root.innerHTML, /Çevrimiçi/);

  await mounted.destroy();
  assert.equal(connectivity.subscribed(), false);
});
