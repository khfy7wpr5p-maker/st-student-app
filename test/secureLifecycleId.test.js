import test from "node:test";
import assert from "node:assert/strict";

import { createAccountUsageSessionReporter } from "../src/account/accountUsageSessionReporter.js";
import { createFirebasePresenceWriter } from "../src/providers/firebase/firebasePresenceWriter.js";

const SECURE_HEX = "000102030405060708090a0b0c0d0e0f";

async function withGlobalCrypto(crypto, callback) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: crypto,
  });
  try {
    return await callback();
  } finally {
    if (previousDescriptor === undefined) {
      delete globalThis.crypto;
    } else {
      Object.defineProperty(globalThis, "crypto", previousDescriptor);
    }
  }
}

function deterministicCrypto() {
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index;
      }
      return bytes;
    },
  };
}

function createPresenceSdk(paths) {
  return {
    ref(_db, path) {
      paths.push(path);
      return path;
    },
    onValue() {
      return () => {};
    },
    onDisconnect() {
      return { remove: async () => {}, set: async () => {} };
    },
    set: async () => {},
    remove: async () => {},
    serverTimestamp: () => ({ ".sv": "timestamp" }),
  };
}

test("usage reporter uses cryptographically secure bytes when randomUUID is unavailable", async () => {
  const clientSessionIds = [];

  await withGlobalCrypto(deterministicCrypto(), async () => {
    const reporter = createAccountUsageSessionReporter({
      apiClient: {
        async recordUsageSession(clientSessionId) {
          clientSessionIds.push(clientSessionId);
        },
      },
    });

    await reporter.reportAuthenticatedBoot("firebase-uid-1");
  });

  assert.deepEqual(clientSessionIds, [`boot-${SECURE_HEX}`]);
});

test("usage reporter fails closed when secure randomness is unavailable", async () => {
  await withGlobalCrypto({}, async () => {
    const reporter = createAccountUsageSessionReporter({
      apiClient: { recordUsageSession: async () => {} },
    });

    await assert.rejects(
      () => reporter.reportAuthenticatedBoot("firebase-uid-1"),
      /secure random generator is unavailable/u,
    );
  });
});

test("presence writer uses cryptographically secure bytes when randomUUID is unavailable", async () => {
  const paths = [];

  await withGlobalCrypto(deterministicCrypto(), async () => {
    const writer = createFirebasePresenceWriter({
      db: {},
      sdk: createPresenceSdk(paths),
    });

    await writer.start("firebase-uid-1");
  });

  assert.deepEqual(paths, [
    ".info/connected",
    `presence/firebase-uid-1/connections/connection-${SECURE_HEX}`,
    "presence/firebase-uid-1/lastOnlineAt",
  ]);
});

test("presence writer fails closed when secure randomness is unavailable", async () => {
  await withGlobalCrypto({}, async () => {
    const writer = createFirebasePresenceWriter({
      db: {},
      sdk: createPresenceSdk([]),
    });

    await assert.rejects(
      () => writer.start("firebase-uid-1"),
      /secure random generator is unavailable/u,
    );
  });
});
