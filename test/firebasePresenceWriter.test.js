import test from "node:test";
import assert from "node:assert/strict";

import { createFirebasePresenceWriter } from "../src/providers/firebase/firebasePresenceWriter.js";

function createHarness() {
  const events = [];
  let connectedListener = null;
  let unsubscribed = 0;
  const disconnectOps = new Map();
  const timestamp = Object.freeze({ ".sv": "timestamp" });

  const sdk = {
    ref(_db, path) {
      return path;
    },
    onValue(path, listener) {
      assert.equal(path, ".info/connected");
      connectedListener = listener;
      return () => {
        unsubscribed += 1;
      };
    },
    onDisconnect(path) {
      const op = {
        async remove() {
          events.push(["disconnect-remove", path]);
        },
        async set(value) {
          events.push(["disconnect-set", path, value]);
        },
        async cancel() {
          events.push(["disconnect-cancel", path]);
        },
      };
      disconnectOps.set(path, op);
      return op;
    },
    async set(path, value) {
      events.push(["set", path, value]);
    },
    async remove(path) {
      events.push(["remove", path]);
    },
    serverTimestamp() {
      return timestamp;
    },
  };

  return {
    sdk,
    events,
    timestamp,
    emitConnected(value) {
      return connectedListener?.({ val: () => value });
    },
    get unsubscribeCount() {
      return unsubscribed;
    },
  };
}

test("presence registers disconnect cleanup before marking the authenticated UID online", async () => {
  const harness = createHarness();
  const writer = createFirebasePresenceWriter({
    db: {},
    sdk: harness.sdk,
    connectionIdFactory: () => "conn-1",
  });

  await writer.start("firebase-uid-1");
  assert.deepEqual(harness.events, []);

  await harness.emitConnected(true);

  assert.deepEqual(harness.events, [
    ["disconnect-remove", "presence/firebase-uid-1/connections/conn-1"],
    ["disconnect-set", "presence/firebase-uid-1/lastOnlineAt", harness.timestamp],
    ["set", "presence/firebase-uid-1/connections/conn-1", true],
  ]);
});

test("presence stop releases listener, connection ownership, and last-online timestamp", async () => {
  const harness = createHarness();
  const writer = createFirebasePresenceWriter({
    db: {},
    sdk: harness.sdk,
    connectionIdFactory: () => "conn-2",
  });

  await writer.start("firebase-uid-2");
  await harness.emitConnected(true);
  harness.events.length = 0;

  await writer.stop();

  assert.equal(harness.unsubscribeCount, 1);
  assert.deepEqual(harness.events, [
    ["disconnect-cancel", "presence/firebase-uid-2/connections/conn-2"],
    ["disconnect-cancel", "presence/firebase-uid-2/lastOnlineAt"],
    ["remove", "presence/firebase-uid-2/connections/conn-2"],
    ["set", "presence/firebase-uid-2/lastOnlineAt", harness.timestamp],
  ]);
});

test("presence start is idempotent for the same UID and ignores disconnected snapshots", async () => {
  const harness = createHarness();
  const writer = createFirebasePresenceWriter({
    db: {},
    sdk: harness.sdk,
    connectionIdFactory: () => "conn-3",
  });

  await writer.start("firebase-uid-3");
  await writer.start("firebase-uid-3");
  await harness.emitConnected(false);

  assert.deepEqual(harness.events, []);
  assert.equal(harness.unsubscribeCount, 0);
});
