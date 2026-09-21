import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { firebaseConfig } from "../../config/firebaseConfig.js";
import { createFirebaseAuthAdapter } from "./firebaseAuthAdapter.js";
import { createFirestoreSharingAdapter } from "./firestoreSharingAdapter.js";

export function createFirebaseBrowserRuntime() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const authAdapter = createFirebaseAuthAdapter({
    auth,
    sdk: {
      browserLocalPersistence,
      setPersistence,
      onAuthStateChanged,
      signInWithEmailAndPassword,
      signOut,
    },
  });

  const sharingService = createFirestoreSharingAdapter({
    db,
    sdk: {
      collection,
      doc,
      getDoc,
      getDocs,
    },
  });

  return Object.freeze({
    authAdapter,
    sharingService,
  });
}
