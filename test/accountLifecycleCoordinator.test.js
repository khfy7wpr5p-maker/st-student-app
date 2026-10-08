import test from "node:test";
import assert from "node:assert/strict";

import { createAccountLifecycleCoordinator } from "../src/account/accountLifecycleCoordinator.js";

function makeHarness({ uid = "firebase-uid-1", presenceStartError = null, usageError = null } = {}) {
  const calls = [];
  const authAdapter = {
    getFirebaseUid() {
      calls.push(["uid"]);
      return uid;
    },
  };
  const presenceWriter = {
    async start(value) {
      calls.push(["presence-start", value]);
      if (presenceStartError !== null) throw presenceStartError;
    },
    async stop() {
      calls.push(["presence-stop"]);
    },
    dispose() {
      calls.push(["presence-dispose"]);
    },
  };
  const usageReporter = {
    async reportAuthenticatedBoot(value) {
      calls.push(["usage", value]);
      if (usageError !== null) throw usageError;
    },
  };
  return { calls, authAdapter, presenceWriter, usageReporter };
}

test("authenticated lifecycle starts presence and records the one boot usage session", async () => {
  const harness = makeHarness();
  const coordinator = createAccountLifecycleCoordinator(harness);

  await coordinator.handleSession({ studentId: "legacy-local-id" });

  assert.deepEqual(harness.calls, [
    ["uid"],
    ["presence-start", "firebase-uid-1"],
    ["usage", "firebase-uid-1"],
  ]);
});

test("sign-out stops presence and never records usage", async () => {
  const harness = makeHarness();
  const coordinator = createAccountLifecycleCoordinator(harness);

  await coordinator.handleSession(null);

  assert.deepEqual(harness.calls, [["presence-stop"]]);
});

test("missing Firebase UID fails closed by clearing presence", async () => {
  const harness = makeHarness({ uid: null });
  const coordinator = createAccountLifecycleCoordinator(harness);

  await coordinator.handleSession({ studentId: "legacy-local-id" });

  assert.deepEqual(harness.calls, [["uid"], ["presence-stop"]]);
});

test("presence and usage failures stay informational and cannot block practice bootstrap", async () => {
  const harness = makeHarness({
    presenceStartError: new Error("presence-provider-detail"),
    usageError: new Error("usage-provider-detail"),
  });
  const coordinator = createAccountLifecycleCoordinator(harness);

  await assert.doesNotReject(() =>
    coordinator.handleSession({ studentId: "legacy-local-id" }),
  );
  assert.deepEqual(harness.calls, [
    ["uid"],
    ["presence-start", "firebase-uid-1"],
    ["usage", "firebase-uid-1"],
  ]);
});

test("usage integration may be disabled while presence remains active", async () => {
  const harness = makeHarness();
  const coordinator = createAccountLifecycleCoordinator({
    authAdapter: harness.authAdapter,
    presenceWriter: harness.presenceWriter,
    usageReporter: null,
  });

  await coordinator.handleSession({ studentId: "legacy-local-id" });

  assert.deepEqual(harness.calls, [
    ["uid"],
    ["presence-start", "firebase-uid-1"],
  ]);
});

test("page teardown releases local presence listener without cancelling server disconnect cleanup", async () => {
  const harness = makeHarness();
  const coordinator = createAccountLifecycleCoordinator(harness);

  coordinator.dispose();

  assert.deepEqual(harness.calls, [["presence-dispose"]]);
});
