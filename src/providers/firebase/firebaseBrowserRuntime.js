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

import {
  createFirebaseDatabaseConfig,
  firebaseConfig,
} from "../../config/firebaseConfig.js";
import { createFirebaseAuthAdapter } from "./firebaseAuthAdapter.js";
import { createFirebasePresenceWriter } from "./firebasePresenceWriter.js";
import { createFirestoreSharingAdapter } from "./firestoreSharingAdapter.js";

function createDisabledPresenceWriter() {
  return Object.freeze({
    async start() {},
    async stop() {},
    dispose() {},
  });
}

export function createFirebaseBrowserRuntime() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const firestoreDb = getFirestore(app);
  const databaseConfig = createFirebaseDatabaseConfig();

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

  const presenceWriter = databaseConfig.enabled
    ? createFirebasePresenceWriter({
        db: getDatabase(app, databaseConfig.url),
        sdk: {
          ref,
          onValue,
          onDisconnect,
          set,
          remove,
          serverTimestamp,
        },
      })
    : createDisabledPresenceWriter();

  return Object.freeze({
    authAdapter,
    sharingService,
    presenceWriter,
  });
}
