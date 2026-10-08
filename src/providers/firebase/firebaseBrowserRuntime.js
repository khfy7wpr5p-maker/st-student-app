import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getIdToken,
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
import {
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

import { firebaseConfig } from "../../config/firebaseConfig.js";
import { createFirebaseAuthAdapter } from "./firebaseAuthAdapter.js";
import { createFirebasePresenceWriter } from "./firebasePresenceWriter.js";
import { createFirestoreSharingAdapter } from "./firestoreSharingAdapter.js";

export function createFirebaseBrowserRuntime() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const firestoreDb = getFirestore(app);
  const realtimeDb = getDatabase(app);

  const authAdapter = createFirebaseAuthAdapter({
    auth,
    sdk: {
      browserLocalPersistence,
      setPersistence,
      onAuthStateChanged,
      getIdToken,
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut,
    },
  });

  const sharingService = createFirestoreSharingAdapter({
    db: firestoreDb,
    sdk: {
      collection,
      doc,
      getDoc,
      getDocs,
    },
  });

  const presenceWriter = createFirebasePresenceWriter({
    db: realtimeDb,
    sdk: {
      ref,
      onValue,
      onDisconnect,
      set,
      remove,
      serverTimestamp,
    },
  });

  return Object.freeze({
    authAdapter,
    sharingService,
    presenceWriter,
  });
}
