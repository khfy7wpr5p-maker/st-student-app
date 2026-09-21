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


function makeVoiceOverFocusHarness() {
  let markup = "";
  let activeElement = null;
  let renderedControl = null;
  let focusRestored = false;

  const ownerDocument = {
    get activeElement() {
      return activeElement;
    },
  };

  function createControl() {
    return {
      dataset: { action: "show-public-pool" },
      isConnected: true,
      focus() {
        focusRestored = true;
        activeElement = this;
      },
    };
  }

  const root = {
    ownerDocument,
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;

      if (activeElement !== null) {
        activeElement.isConnected = false;
      }

      renderedControl = createControl();
    },
    addEventListener() {},
    removeEventListener() {},
    contains(element) {
      return element === activeElement || element === renderedControl;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-action]" && renderedControl !== null
        ? [renderedControl]
        : [];
    },
  };

  return {
    root,
    focusCurrentControl() {
      activeElement = renderedControl;
      focusRestored = false;
    },
    wasFocusRestored() {
      return focusRestored;
    },
  };
}

test("same-screen connectivity repaint restores the focused VoiceOver control", async () => {
  const connectivity = makeConnectivityHarness();
  const focus = makeVoiceOverFocusHarness();

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
    async synchronizeOffline() {},
  };

  const mounted = mountStudentApp({
    root: focus.root,
    controller,
    connectivityPort: connectivity.port,
  });

  await mounted.render();
  focus.focusCurrentControl();

  connectivity.emit(CONNECTIVITY_STATES.ONLINE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await mounted.render();

  assert.equal(focus.wasFocusRestored(), true);

  await mounted.destroy();
});


test("My Work permission failures surface a bounded access diagnosis without provider details", async () => {
  let clickListener = null;
  const root = {
    innerHTML: "",
    ownerDocument: { activeElement: null },
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
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
  const controller = {
    getState() {
      return {
        screen: "home",
        session: { studentId: "student-a" },
        items: [],
        practice: null,
      };
    },
    showMyWork() {
      const error = new Error("Missing or insufficient permissions");
      error.code = "permission-denied";
      throw error;
    },
    getPracticeRenderSource() {
      return null;
    },
  };

  const mounted = mountStudentApp({ root, controller });

  await clickListener({
    target: {
      closest() {
        return { dataset: { action: "show-my-work" } };
      },
    },
  });

  assert.match(root.innerHTML, /Kişisel çalışmalar için erişim izni reddedildi/);
  assert.doesNotMatch(root.innerHTML, /permission-denied|insufficient permissions/i);

  await mounted.destroy();
});

test("My Work manifest failures surface a bounded data diagnosis", async () => {
  let clickListener = null;
  const root = {
    innerHTML: "",
    ownerDocument: { activeElement: null },
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
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
  const controller = {
    getState() {
      return {
        screen: "home",
        session: { studentId: "student-a" },
        items: [],
        practice: null,
      };
    },
    showMyWork() {
      throw new Error("Firestore publication scope mismatch");
    },
    getPracticeRenderSource() {
      return null;
    },
  };

  const mounted = mountStudentApp({ root, controller });

  await clickListener({
    target: {
      closest() {
        return { dataset: { action: "show-my-work" } };
      },
    },
  });

  assert.match(root.innerHTML, /Kişisel çalışma kaydı eksik veya uyumsuz/);
  assert.doesNotMatch(root.innerHTML, /scope mismatch/i);

  await mounted.destroy();
});
