import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";

const student = createStudentSession({
  studentId: "student-a",
  displayName: "Ali",
});

function makeSharingService() {
  return {
    listPublicPool({ session }) {
      assert.equal(session.studentId, "student-a");
      return [
        {
          publication: {
            publicationId: "pub-public",
            packageId: "pkg-public",
            scope: "public_pool",
          },
          package: {
            packageId: "pkg-public",
            title: "Public Etüt",
            content: {
              score: {
                format: "musicxml",
                data: "<score-partwise>SECRET SCORE</score-partwise>",
              },
            },
          },
        },
      ];
    },

    listMyWork({ session }) {
      assert.equal(session.studentId, "student-a");
      return [
        {
          publication: {
            publicationId: "pub-private",
            packageId: "pkg-private",
            scope: "student_private",
            recipientStudentId: "student-a",
          },
          package: {
            packageId: "pkg-private",
            title: "Özel Etüt",
            debug: { trace: "secret" },
          },
        },
      ];
    },

    getPracticeItem({ session, publicationId }) {
      assert.equal(session.studentId, "student-a");
      assert.equal(publicationId, "pub-public");

      return {
        publication: {
          publicationId,
          packageId: "pkg-public",
          scope: "public_pool",
        },
        package: {
          packageId: "pkg-public",
          title: "Public Etüt",
          approvedRevision: {
            revisionId: "R1",
            state: "teacher_approved",
          },
          content: {
            score: {
              format: "musicxml",
              data: "<score-partwise>SECRET SCORE</score-partwise>",
            },
          },
          omr: { provider: "should-never-reach-ui" },
        },
      };
    },
  };
}

test("unauthenticated controller starts at sign in", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.SIGN_IN);
  assert.equal(controller.getState().session, null);
});

test("attaching a valid session enters home", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  controller.attachSession(student);

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.HOME);
  assert.equal(controller.getState().session.studentId, "student-a");
});

test("invalid session cannot be attached", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  assert.throws(
    () => controller.attachSession({ displayName: "Ali" }),
    /authenticated student session required/,
  );
});

test("Public Pool becomes a safe summary list", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.showPublicPool();

  const state = controller.getState();
  assert.equal(state.screen, STUDENT_APP_SCREENS.PUBLIC_POOL);
  assert.deepEqual(state.items, [
    {
      publicationId: "pub-public",
      packageId: "pkg-public",
      title: "Public Etüt",
    },
  ]);
  assert.equal(JSON.stringify(state).includes("SECRET SCORE"), false);
});

test("My Work becomes a safe summary list without recipient id", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.showMyWork();

  const state = controller.getState();
  assert.equal(state.screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.deepEqual(state.items, [
    {
      publicationId: "pub-private",
      packageId: "pkg-private",
      title: "Özel Etüt",
    },
  ]);
  assert.equal(JSON.stringify(state).includes("recipientStudentId"), false);
  assert.equal(JSON.stringify(state).includes("secret"), false);
});

test("Open Practice keeps only safe read-only presentation data", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.openPractice("pub-public");

  const state = controller.getState();
  assert.equal(state.screen, STUDENT_APP_SCREENS.PRACTICE);
  assert.deepEqual(state.practice, {
    publicationId: "pub-public",
    packageId: "pkg-public",
    title: "Public Etüt",
  });
  assert.equal(JSON.stringify(state).includes("MusicXML"), false);
  assert.equal(JSON.stringify(state).includes("SECRET SCORE"), false);
  assert.equal(JSON.stringify(state).includes("approvedRevision"), false);
  assert.equal(JSON.stringify(state).includes("omr"), false);
});

test("sign out clears session and student data", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.showPublicPool();
  controller.signOut();

  assert.deepEqual(controller.getState(), {
    screen: STUDENT_APP_SCREENS.SIGN_IN,
    session: null,
    items: [],
    practice: null,
  });
});

test("student controller exposes no sharing write operations", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  assert.equal("publish" in controller, false);
  assert.equal("revoke" in controller, false);
});


test("controller snapshots the authenticated student id", () => {
  const mutableSession = {
    studentId: "student-a",
    email: "student@example.test",
    displayName: "Ali",
  };
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  controller.attachSession(mutableSession);
  mutableSession.studentId = "student-b";
  mutableSession.email = "changed@example.test";

  const state = controller.getState();

  assert.deepEqual(state.session, { studentId: "student-a" });
  assert.equal(Object.isFrozen(state.session), true);
});
