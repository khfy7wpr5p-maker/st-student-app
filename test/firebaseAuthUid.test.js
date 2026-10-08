import test from "node:test";
import assert from "node:assert/strict";

import { createFirebaseAuthAdapter } from "../src/providers/firebase/firebaseAuthAdapter.js";

function createAdapter(currentUser) {
  const auth = { currentUser };
  const adapter = createFirebaseAuthAdapter({
    auth,
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged() {
        return () => {};
      },
    },
  });
  return { auth, adapter };
}

test("auth adapter exposes the current Firebase UID only through an internal bounded getter", () => {
  const { adapter } = createAdapter({ uid: "firebase-uid-123" });
  assert.equal(adapter.getFirebaseUid(), "firebase-uid-123");
});

test("auth adapter returns null instead of inventing a Firebase UID", () => {
  const { auth, adapter } = createAdapter(null);
  assert.equal(adapter.getFirebaseUid(), null);
  auth.currentUser = { uid: "   " };
  assert.equal(adapter.getFirebaseUid(), null);
});
