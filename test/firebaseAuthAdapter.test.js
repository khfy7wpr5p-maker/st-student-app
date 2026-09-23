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


test("email/password sign-in returns only a normalized Student App session", async () => {
  const calls = [];
  const adapter = createFirebaseAuthAdapter({
    auth: { name: "auth" },
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged() {
        return () => {};
      },
      async signInWithEmailAndPassword(auth, email, password) {
        calls.push(["signIn", auth.name, email, password]);
        return {
          user: {
            uid: "uid-email",
            email,
            accessToken: "DO_NOT_LEAK",
          },
        };
      },
    },
  });

  const session = await adapter.signIn({
    email: "student@example.test",
    password: "secret-password",
  });

  assert.equal(session.studentId, "uid-email");
  assert.equal(session.email, "student@example.test");
  assert.equal(JSON.stringify(session).includes("secret-password"), false);
  assert.equal(JSON.stringify(session).includes("DO_NOT_LEAK"), false);
  assert.deepEqual(calls, [
    ["signIn", "auth", "student@example.test", "secret-password"],
  ]);
});

test("sign-out delegates to Firebase Auth without returning provider data", async () => {
  const calls = [];
  const adapter = createFirebaseAuthAdapter({
    auth: { name: "auth" },
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged() {
        return () => {};
      },
      async signOut(auth) {
        calls.push(["signOut", auth.name]);
        return { token: "DO_NOT_RETURN" };
      },
    },
  });

  const result = await adapter.signOut();

  assert.equal(result, undefined);
  assert.deepEqual(calls, [["signOut", "auth"]]);
});


test("getIdToken returns an ephemeral token only for current authenticated user", async () => {
  const user = { uid: "uid-a" };
  const adapter = createFirebaseAuthAdapter({
    auth: { currentUser: user },
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged() {
        return () => {};
      },
      async getIdToken(candidate) {
        assert.equal(candidate, user);
        return "fresh-token";
      },
    },
  });

  assert.equal(await adapter.getIdToken(), "fresh-token");
  assert.equal(JSON.stringify(adapter).includes("fresh-token"), false);
});

test("getIdToken fails closed when no current Firebase user exists", async () => {
  const adapter = createFirebaseAuthAdapter({
    auth: { currentUser: null },
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged() {
        return () => {};
      },
      async getIdToken() {
        return "must-not-be-called";
      },
    },
  });

  await assert.rejects(
    () => adapter.getIdToken(),
    /authenticated Firebase user required/i,
  );
});
