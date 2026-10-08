import test from "node:test";
import assert from "node:assert/strict";

import { createFirebaseAuthAdapter } from "../src/providers/firebase/firebaseAuthAdapter.js";

test("createAccount delegates to Firebase Auth and returns only the existing normalized legacy session", async () => {
  const calls = [];
  const adapter = createFirebaseAuthAdapter({
    auth: { name: "auth" },
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged() {
        return () => {};
      },
      async createUserWithEmailAndPassword(auth, email, password) {
        calls.push(["create", auth.name, email, password]);
        return {
          user: {
            uid: "firebase-uid-created",
            email,
            accessToken: "DO_NOT_LEAK",
          },
        };
      },
    },
  });

  const session = await adapter.createAccount({
    email: "  new.student@example.test  ",
    password: "new-secret-password",
  });

  assert.equal(session.studentId, "firebase-uid-created");
  assert.equal(session.email, "new.student@example.test");
  assert.equal(JSON.stringify(session).includes("new-secret-password"), false);
  assert.equal(JSON.stringify(session).includes("DO_NOT_LEAK"), false);
  assert.deepEqual(calls, [
    ["create", "auth", "new.student@example.test", "new-secret-password"],
  ]);
});
