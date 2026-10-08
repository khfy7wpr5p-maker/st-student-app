const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

const FIREBASE_KEY_FORBIDDEN = /[.#$\[\]\/]/u;

function normalizeFirebaseUid(value) {
  if (!hasText(value)) {
    throw new TypeError("firebaseUid must be a non-empty string");
  }
  const uid = value.trim();
  if (uid.length > 128 || FIREBASE_KEY_FORBIDDEN.test(uid)) {
    throw new TypeError("firebaseUid is not safe for Realtime Database presence");
  }
  return uid;
}

function normalizeConnectionId(value) {
  if (!hasText(value)) {
    throw new TypeError("connectionId must be a non-empty string");
  }
  const id = value.trim();
  if (id.length > 160 || FIREBASE_KEY_FORBIDDEN.test(id)) {
    throw new TypeError("connectionId is not safe for Realtime Database presence");
  }
  return id;
}

function defaultConnectionIdFactory() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (hasText(uuid)) {
    return `connection-${uuid}`;
  }
  return `connection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createFirebasePresenceWriter({
  db,
  sdk,
  connectionIdFactory = defaultConnectionIdFactory,
} = {}) {
  for (const method of ["ref", "onValue", "onDisconnect", "set", "remove", "serverTimestamp"]) {
    if (typeof sdk?.[method] !== "function") {
      throw new TypeError(`Firebase Realtime Database SDK seam missing ${method}`);
    }
  }
  if (typeof connectionIdFactory !== "function") {
    throw new TypeError("connectionIdFactory must be a function");
  }

  let active = null;

  async function stop() {
    const current = active;
    active = null;
    if (current === null) {
      return;
    }

    try {
      current.unsubscribe?.();
    } catch {
      // Presence cleanup must never block the Student App.
    }

    for (const disconnect of [current.connectionDisconnect, current.lastOnlineDisconnect]) {
      if (disconnect !== null && typeof disconnect?.cancel === "function") {
        try {
          await disconnect.cancel();
        } catch {
          // Best effort only.
        }
      }
    }

    try {
      await sdk.remove(current.connectionRef);
    } catch {
      // Best effort only.
    }

    try {
      await sdk.set(current.lastOnlineRef, sdk.serverTimestamp());
    } catch {
      // Best effort only.
    }
  }

  async function start(firebaseUid) {
    const uid = normalizeFirebaseUid(firebaseUid);
    if (active?.uid === uid) {
      return;
    }
    if (active !== null) {
      await stop();
    }

    const connectionId = normalizeConnectionId(connectionIdFactory());
    const connectedRef = sdk.ref(db, ".info/connected");
    const connectionRef = sdk.ref(
      db,
      `presence/${uid}/connections/${connectionId}`,
    );
    const lastOnlineRef = sdk.ref(db, `presence/${uid}/lastOnlineAt`);

    const state = {
      uid,
      connectionRef,
      lastOnlineRef,
      connectionDisconnect: null,
      lastOnlineDisconnect: null,
      unsubscribe: null,
    };
    active = state;

    try {
      const unsubscribe = sdk.onValue(connectedRef, async (snapshot) => {
        if (active !== state || snapshot?.val?.() !== true) {
          return;
        }

        try {
          const connectionDisconnect = sdk.onDisconnect(connectionRef);
          await connectionDisconnect.remove();
          const lastOnlineDisconnect = sdk.onDisconnect(lastOnlineRef);
          await lastOnlineDisconnect.set(sdk.serverTimestamp());

          if (active !== state) {
            await connectionDisconnect.cancel?.().catch?.(() => {});
            await lastOnlineDisconnect.cancel?.().catch?.(() => {});
            return;
          }

          state.connectionDisconnect = connectionDisconnect;
          state.lastOnlineDisconnect = lastOnlineDisconnect;
          await sdk.set(connectionRef, true);
        } catch {
          // Presence is informational; failures must not block practice.
        }
      });
      state.unsubscribe = typeof unsubscribe === "function" ? unsubscribe : () => {};
    } catch {
      if (active === state) {
        active = null;
      }
    }
  }

  return Object.freeze({ start, stop });
}
