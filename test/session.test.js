import test from "node:test";
import assert from "node:assert/strict";

import {
  createStudentSession,
  getAuthenticatedStudentId,
  isAuthenticatedStudent,
} from "../src/auth/session.js";

test("student session exposes stable internal studentId", () => {
  const session = createStudentSession({
    studentId: "student-001",
    email: "student@example.test",
    displayName: "Ali",
  });

  assert.equal(session.studentId, "student-001");
  assert.equal(getAuthenticatedStudentId(session), "student-001");
  assert.equal(isAuthenticatedStudent(session), true);
  assert.equal(Object.isFrozen(session), true);
});

test("missing or blank studentId is unauthenticated", () => {
  assert.equal(getAuthenticatedStudentId(null), null);
  assert.equal(getAuthenticatedStudentId({}), null);
  assert.equal(getAuthenticatedStudentId({ studentId: "   " }), null);
  assert.equal(isAuthenticatedStudent({ email: "same@example.test" }), false);
});

test("display fields never substitute for studentId", () => {
  assert.equal(
    getAuthenticatedStudentId({
      email: "student-001",
      displayName: "student-001",
    }),
    null,
  );
});

test("createStudentSession rejects blank studentId", () => {
  assert.throws(
    () => createStudentSession({ studentId: " " }),
    /studentId must be a non-empty string/,
  );
});
