import test from "node:test";
import assert from "node:assert/strict";

import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { mountStudentApp } from "../src/ui/mountStudentApp.js";

test("mount forwards typed credentials to requestSignIn without storing them in controller state", async () => {
  let clickListener = null;
  let screen = STUDENT_APP_SCREENS.SIGN_IN;
  let session = null;
  let seenCredentials = null;

  const root = {
    innerHTML: "",
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
    removeEventListener() {},
    contains() {
      return true;
    },
    querySelector(selector) {
      if (selector === "[data-sign-in-email]") {
        return { value: "student@example.test" };
      }
      if (selector === "[data-sign-in-password]") {
        return { value: "secret-password" };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  const controller = {
    getState() {
      return {
        screen,
        session,
        items: [],
        practice: null,
      };
    },
    getPracticeRenderSource() {
      return null;
    },
    attachSession(nextSession) {
      session = nextSession;
      screen = STUDENT_APP_SCREENS.HOME;
    },
  };

  const mounted = mountStudentApp({
    root,
    controller,
    requestSignIn: async (credentials) => {
      seenCredentials = credentials;
      return { studentId: "uid-email" };
    },
  });

  await clickListener({
    target: {
      closest() {
        return { dataset: { action: "request-sign-in" } };
      },
    },
  });

  assert.deepEqual(seenCredentials, {
    email: "student@example.test",
    password: "secret-password",
  });
  assert.equal(controller.getState().session.studentId, "uid-email");
  assert.equal(JSON.stringify(controller.getState()).includes("secret-password"), false);

  await mounted.destroy();
});
