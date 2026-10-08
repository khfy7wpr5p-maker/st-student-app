import test from "node:test";
import assert from "node:assert/strict";

import { createFirebasePresenceWriter } from "../src/providers/firebase/firebasePresenceWriter.js";

test("presence dispose releases only the local listener and preserves server onDisconnect cleanup", async () => {
  const events = [];
  let listener = null;
  const writer = createFirebasePresenceWriter({
    db: {},
    connectionIdFactory: () => "conn-dispose",
    sdk: {
      ref(_db, path) {
        return path;
      },
      onValue(_path, next) {
        listener = next;
        return () => events.push(["unsubscribe"]);
      },
      onDisconnect(path) {
        return {
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
      },
      async set(path, value) {
        events.push(["set", path, value]);
      },
      async remove(path) {
        events.push(["remove", path]);
      },
      serverTimestamp() {
        return { ".sv": "timestamp" };
      },
    },
  });

  await writer.start("firebase-uid-dispose");
  await listener({ val: () => true });
  events.length = 0;

  writer.dispose();

  assert.deepEqual(events, [["unsubscribe"]]);
});
