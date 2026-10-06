import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createStudentSession } from "../src/auth/session.js";
import { ASSIGNMENT_STATES } from "../src/contracts/privateAssignment.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
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
  const promise = new Promise((resolveValue) => {
    resolve = resolveValue;
  });
  return { promise, resolve };
}

test("SES-192 service worker pins the PERF-A browser modules for offline reload", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(source, /\.\/src\/ui\/studentPerfA\.js/);
  assert.match(source, /\.\/src\/ui\/mountStudentAppPerfA\.js/);
});

test("SES-192 sign-out invalidates an in-flight same-session navigation", async () => {
  const pendingAssignments = deferred();
  const readService = createStudentPerfAReadService({
    listPieces() {
      return [];
    },
    listAssignments() {
      return pendingAssignments.promise;
    },
  });
  const baseController = createStudentAppController({
    sharingService: {},
    student08ReadService: readService,
    initialSession: student,
  });
  const controller = createStudentPerfAController({
    controller: baseController,
    readService,
  });

  const navigation = controller.showMyWork(ASSIGNMENT_STATES.ACTIVE);
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.MY_WORK);

  controller.signOut();
  pendingAssignments.resolve([]);
  await navigation;

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.SIGN_IN);
  assert.equal(controller.getState().session, null);
});