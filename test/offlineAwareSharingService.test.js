import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  CONNECTIVITY_STATES,
} from "../src/offline/connectivityPort.js";
import { createOfflineAwareSharingService } from "../src/offline/offlineAwareSharingService.js";
import {
  makePrivateDelivery,
  makePublicDelivery,
  makePutArgs,
} from "./support/practiceFixtures.js";

const studentA = createStudentSession({ studentId: "student-a" });
const studentB = createStudentSession({ studentId: "student-b" });

const fixedConnectivity = (state) => ({
  getState: () => state,
  subscribe: () => () => {},
});

function makeOnlineSharingService() {
  return {
    async listPublicPool() {
      return [makePublicDelivery()];
    },
    async listMyWork() {
      return [makePrivateDelivery("student-a")];
    },
    async getPracticeItem({ publicationId }) {
      assert.equal(publicationId, "pub-a");
      return makePublicDelivery();
    },
  };
}

function onlineServiceThatMustNotBeCalled() {
  return {
    async listPublicPool() {
      throw new Error("online service must not be called");
    },
    async listMyWork() {
      throw new Error("online service must not be called");
    },
    async getPracticeItem() {
      throw new Error("online service must not be called");
    },
  };
}

test("online Practice open caches only after authorization", async () => {
  const offlineRepository = createInMemoryOfflineRepository();
  const service = createOfflineAwareSharingService({
    onlineSharingService: makeOnlineSharingService(),
    offlineRepository,
    connectivityPort: fixedConnectivity(CONNECTIVITY_STATES.ONLINE),
    clock: () => "2026-09-21T12:00:00Z",
  });

  const item = await service.getPracticeItem({
    session: studentA,
    publicationId: "pub-a",
  });

  assert.equal(item.package.packageId, "pkg-a");
  assert.deepEqual(item.offlineAvailability, {
    source: "online",
    deviceAvailable: true,
    saveFailed: false,
  });

  const cached = await offlineRepository.getActiveByPublicationId({
    studentId: "student-a",
    publicationId: "pub-a",
  });
  assert.equal(cached.packageId, "pkg-a");
});

test("cache-write failure does not block authorized online Practice", async () => {
  const offlineRepository = {
    async putAuthorized() {
      throw new Error("indexeddb quota internal detail");
    },
    async getActiveByPublicationId() {
      return null;
    },
    async listActiveForStudent() {
      return [];
    },
  };

  const service = createOfflineAwareSharingService({
    onlineSharingService: makeOnlineSharingService(),
    offlineRepository,
    connectivityPort: fixedConnectivity(CONNECTIVITY_STATES.ONLINE),
    clock: () => "2026-09-21T12:00:00Z",
  });

  const item = await service.getPracticeItem({
    session: studentA,
    publicationId: "pub-a",
  });

  assert.equal(item.package.packageId, "pkg-a");
  assert.deepEqual(item.offlineAvailability, {
    source: "online",
    deviceAvailable: false,
    saveFailed: true,
  });
  assert.equal(
    JSON.stringify(item).includes("indexeddb quota internal detail"),
    false,
  );
});

test("offline mode lists only current student's ACTIVE private cache", async () => {
  const offlineRepository = createInMemoryOfflineRepository();
  await offlineRepository.putAuthorized(
    makePutArgs("student-a", makePrivateDelivery("student-a")),
  );
  await offlineRepository.putAuthorized(
    makePutArgs("student-b", makePrivateDelivery("student-b")),
  );

  const service = createOfflineAwareSharingService({
    onlineSharingService: onlineServiceThatMustNotBeCalled(),
    offlineRepository,
    connectivityPort: fixedConnectivity(CONNECTIVITY_STATES.OFFLINE),
    clock: () => "2026-09-21T12:00:00Z",
  });

  const items = await service.listMyWork({ session: studentA });

  assert.deepEqual(
    items.map((item) => item.publication.recipientStudentId),
    ["student-a"],
  );
  assert.equal(items[0].offlineAvailability.source, "offline");
  assert.equal(items[0].offlineAvailability.deviceAvailable, true);
});

test("offline Practice opens only ACTIVE current-student cache", async () => {
  const offlineRepository = createInMemoryOfflineRepository();
  await offlineRepository.putAuthorized(
    makePutArgs("student-a", makePublicDelivery()),
  );

  const service = createOfflineAwareSharingService({
    onlineSharingService: onlineServiceThatMustNotBeCalled(),
    offlineRepository,
    connectivityPort: fixedConnectivity(CONNECTIVITY_STATES.OFFLINE),
    clock: () => "2026-09-21T12:00:00Z",
  });

  const item = await service.getPracticeItem({
    session: studentA,
    publicationId: "pub-a",
  });
  assert.equal(item.package.packageId, "pkg-a");
  assert.equal(item.offlineAvailability.source, "offline");

  await assert.rejects(
    () =>
      service.getPracticeItem({
        session: studentB,
        publicationId: "pub-a",
      }),
    /offline practice unavailable/,
  );
});

test("online authorization failure never falls back to stale cache", async () => {
  const offlineRepository = createInMemoryOfflineRepository();
  await offlineRepository.putAuthorized(
    makePutArgs("student-a", makePublicDelivery()),
  );

  const service = createOfflineAwareSharingService({
    onlineSharingService: {
      async listPublicPool() {
        throw new Error("forbidden");
      },
      async listMyWork() {
        throw new Error("forbidden");
      },
      async getPracticeItem() {
        throw new Error("forbidden");
      },
    },
    offlineRepository,
    connectivityPort: fixedConnectivity(CONNECTIVITY_STATES.ONLINE),
    clock: () => "2026-09-21T12:00:00Z",
  });

  await assert.rejects(
    () =>
      service.getPracticeItem({
        session: studentA,
        publicationId: "pub-a",
      }),
    /forbidden/,
  );
});

test("online lists report existing device cache without caching every list item", async () => {
  const offlineRepository = createInMemoryOfflineRepository();
  await offlineRepository.putAuthorized(
    makePutArgs("student-a", makePublicDelivery()),
  );
  let puts = 0;
  const wrappedRepository = {
    ...offlineRepository,
    async putAuthorized(args) {
      puts += 1;
      return offlineRepository.putAuthorized(args);
    },
  };

  const service = createOfflineAwareSharingService({
    onlineSharingService: makeOnlineSharingService(),
    offlineRepository: wrappedRepository,
    connectivityPort: fixedConnectivity(CONNECTIVITY_STATES.ONLINE),
    clock: () => "2026-09-21T12:00:00Z",
  });

  const items = await service.listPublicPool({ session: studentA });
  assert.equal(items[0].offlineAvailability.deviceAvailable, true);
  assert.equal(puts, 0);
});
