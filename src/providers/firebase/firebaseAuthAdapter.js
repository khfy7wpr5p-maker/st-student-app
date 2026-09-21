import { createStudentSession } from "../../auth/session.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function studentSessionFromFirebaseUser(user) {
  if (user === null || user === undefined) {
    return null;
  }

  if (!hasText(user.uid)) {
    throw new TypeError("Firebase user uid must be a non-empty string");
  }

  return createStudentSession({
    studentId: user.uid,
    email: user.email,
    displayName: user.displayName,
  });
}

export function createFirebaseAuthAdapter({ auth, sdk }) {
  if (
    sdk === null ||
    typeof sdk?.setPersistence !== "function" ||
    typeof sdk?.onAuthStateChanged !== "function"
  ) {
    throw new TypeError("Firebase Auth SDK seam is incomplete");
  }

  return Object.freeze({
    async restoreSession() {
      await sdk.setPersistence(auth, sdk.browserLocalPersistence);

      return new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        let settled = false;

        const finish = (user) => {
          if (settled) {
            return;
          }
          settled = true;

          try {
            resolve(studentSessionFromFirebaseUser(user));
          } catch (error) {
            reject(error);
          } finally {
            queueMicrotask(() => unsubscribe());
          }
        };

        const fail = (error) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
          queueMicrotask(() => unsubscribe());
        };

        const candidate = sdk.onAuthStateChanged(auth, finish, fail);
        if (typeof candidate === "function") {
          unsubscribe = candidate;
        }
      });
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("auth listener must be a function");
      }

      const unsubscribe = sdk.onAuthStateChanged(
        auth,
        (user) => {
          listener(studentSessionFromFirebaseUser(user));
        },
        () => {
          // A provider error is not normalized into a fake sign-out event.
        },
      );

      return typeof unsubscribe === "function" ? unsubscribe : () => {};
    },
  });
}
