import test from "node:test";
import assert from "node:assert/strict";

import {
  createFirebaseAuthAdapter,
  studentSessionFromFirebaseUser,
} from "../src/providers/firebase/firebaseAuthAdapter.js";

test("Firebase uid becomes the stable Student App studentId", () => {
  const session = studentSessionFromFirebaseUser({
    uid: "firebase-uid-a",
    email: "a@example.test",
    displayName: "Ali",
  });

  assert.equal(session.studentId, "firebase-uid-a");
  assert.equal(session.email, "a@example.test");
  assert.equal(Object.isFrozen(session), true);
});

test("raw Firebase token fields are ignored", () => {
  const session = studentSessionFromFirebaseUser({
    uid: "firebase-uid-a",
    stsTokenManager: { accessToken: "SECRET" },
    accessToken: "SECOND_SECRET",
  });

  assert.equal(JSON.stringify(session).includes("SECRET"), false);
});

test("null Firebase user normalizes to no student session", () => {
  assert.equal(studentSessionFromFirebaseUser(null), null);
});

test("restoreSession configures local persistence and returns normalized user", async () => {
  const calls = [];
  let unsubscribed = false;
  const user = {
    uid: "firebase-uid-a",
    email: "a@example.test",
    stsTokenManager: { accessToken: "SECRET" },
  };

  const adapter = createFirebaseAuthAdapter({
    auth: { name: "auth" },
    sdk: {
      browserLocalPersistence: { kind: "local" },
      async setPersistence(auth, persistence) {
        calls.push(["setPersistence", auth.name, persistence.kind]);
      },
      onAuthStateChanged(auth, next) {
        calls.push(["onAuthStateChanged", auth.name]);
        queueMicrotask(() => next(user));
        return () => {
          unsubscribed = true;
        };
      },
    },
  });

  const session = await adapter.restoreSession();

  assert.equal(session.studentId, "firebase-uid-a");
  assert.deepEqual(calls, [
    ["setPersistence", "auth", "local"],
    ["onAuthStateChanged", "auth"],
  ]);
  assert.equal(unsubscribed, true);
  assert.equal(JSON.stringify(session).includes("SECRET"), false);
});

test("auth subscription emits normalized sessions only", async () => {
  let nextAuthUser = null;
  let removed = false;
  const adapter = createFirebaseAuthAdapter({
    auth: {},
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged(_auth, next) {
        nextAuthUser = next;
        return () => {
          removed = true;
        };
      },
    },
  });

  const seen = [];
  const unsubscribe = adapter.subscribe((session) => seen.push(session));
  nextAuthUser({ uid: "uid-1", accessToken: "DO_NOT_LEAK" });
  nextAuthUser(null);

  assert.deepEqual(
    seen.map((session) => session?.studentId ?? null),
    ["uid-1", null],
  );
  assert.equal(JSON.stringify(seen).includes("DO_NOT_LEAK"), false);

  unsubscribe();
  assert.equal(removed, true);
});
