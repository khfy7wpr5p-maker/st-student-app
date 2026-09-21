import test from "node:test";
import assert from "node:assert/strict";

import {
  CONNECTIVITY_STATES,
  createBrowserConnectivityPort,
} from "../src/offline/connectivityPort.js";

function makeWindowHarness() {
  const listeners = new Map();

  return {
    windowObject: {
      addEventListener(name, listener) {
        listeners.set(name, listener);
      },
      removeEventListener(name, listener) {
        if (listeners.get(name) === listener) {
          listeners.delete(name);
        }
      },
    },
    emit(name) {
      listeners.get(name)?.({ type: name, secret: "raw-event" });
    },
    listeners,
  };
}

test("browser connectivity normalizes navigator.onLine", () => {
  assert.equal(
    createBrowserConnectivityPort({
      navigatorObject: { onLine: false },
      windowObject: null,
    }).getState(),
    CONNECTIVITY_STATES.OFFLINE,
  );

  assert.equal(
    createBrowserConnectivityPort({
      navigatorObject: { onLine: true },
      windowObject: null,
    }).getState(),
    CONNECTIVITY_STATES.ONLINE,
  );
});

test("connectivity subscription emits only normalized state and unsubscribes", () => {
  const harness = makeWindowHarness();
  const navigatorObject = { onLine: false };
  const port = createBrowserConnectivityPort({
    navigatorObject,
    windowObject: harness.windowObject,
  });
  const states = [];
  const unsubscribe = port.subscribe((state) => states.push(state));

  navigatorObject.onLine = true;
  harness.emit("online");
  navigatorObject.onLine = false;
  harness.emit("offline");

  assert.deepEqual(states, [
    CONNECTIVITY_STATES.ONLINE,
    CONNECTIVITY_STATES.OFFLINE,
  ]);
  assert.equal(JSON.stringify(states).includes("raw-event"), false);

  unsubscribe();
  harness.emit("online");
  assert.equal(states.length, 2);
});
