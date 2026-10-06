import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
import {
  createStudentPerfAController,
  createStudentPerfASharingService,
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

test("SES-192 legacy Public Pool cannot overwrite newer My Work navigation", async () => {
  const pool = deferred();
  const work = deferred();
  const sharingService = createStudentPerfASharingService({
    listPublicPool() {
      return pool.promise;
    },
    listMyWork() {
      return work.promise;
    },
  });
  const baseController = createStudentAppController({
    sharingService,
    initialSession: student,
  });
  const controller = createStudentPerfAController({
    controller: baseController,
    sharingService,
  });

  const oldNavigation = controller.showPublicPool();
  const currentNavigation = controller.showMyWork();

  work.resolve([]);
  await currentNavigation;
  pool.resolve([
    {
      publicationId: "pub-1",
      title: "Old Pool",
      shortDescription: "",
      publishedAt: "2026-10-06T12:00:00Z",
      deviceAvailable: false,
    },
  ]);
  await oldNavigation;

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.deepEqual(controller.getState().items, []);
});