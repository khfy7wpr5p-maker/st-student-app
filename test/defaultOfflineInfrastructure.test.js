import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";

import { CONNECTIVITY_STATES } from "../src/offline/connectivityPort.js";
import { createDefaultOfflineInfrastructure } from "../src/offline/defaultOfflineInfrastructure.js";

const onlineSharingService = Object.freeze({
  listPublicPool() {
    return [];
  },
  listMyWork() {
    return [];
  },
  getPracticeItem() {
    throw new Error("not configured");
  },
});

test("missing IndexedDB degrades to online service without blocking bootstrap", () => {
  const infrastructure = createDefaultOfflineInfrastructure({
    onlineSharingService,
    indexedDBObject: null,
    navigatorObject: { onLine: true },
    windowObject: null,
  });

  assert.equal(infrastructure.sharingService, onlineSharingService);
  assert.equal(infrastructure.offlineRepositoryAvailable, false);
  assert.equal(infrastructure.offlineRepository, null);
  assert.equal(
    infrastructure.connectivityPort.getState(),
    CONNECTIVITY_STATES.ONLINE,
  );
});

test("available IndexedDB creates offline-aware sharing without Firebase configuration", () => {
  const infrastructure = createDefaultOfflineInfrastructure({
    onlineSharingService,
    indexedDBObject: indexedDB,
    navigatorObject: { onLine: false },
    windowObject: null,
    dbName: "st-student-default-infra-test",
  });

  assert.notEqual(infrastructure.sharingService, onlineSharingService);
  assert.equal(infrastructure.offlineRepositoryAvailable, true);
  assert.equal(
    typeof infrastructure.offlineRepository?.getActiveByAccessRef,
    "function",
  );
  assert.equal(
    infrastructure.connectivityPort.getState(),
    CONNECTIVITY_STATES.OFFLINE,
  );
  assert.equal(
    JSON.stringify(infrastructure).includes("apiKey"),
    false,
  );
});
