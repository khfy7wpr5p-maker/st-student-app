import test from "node:test";
import assert from "node:assert/strict";

import { createAccountUsageSessionReporter } from "../src/account/accountUsageSessionReporter.js";

test("usage reporter sends one bounded clientSessionId per authenticated UID in one page lifecycle", async () => {
  const calls = [];
  const reporter = createAccountUsageSessionReporter({
    apiClient: {
      async recordUsageSession(clientSessionId) {
        calls.push(clientSessionId);
        return { isNew: true, totalSessions: 1, lastSessionAt: "2026-10-08T06:00:00.000Z" };
      },
    },
    clientSessionIdFactory: () => "boot-1234",
  });

  await reporter.reportAuthenticatedBoot("firebase-uid-1");
  await reporter.reportAuthenticatedBoot("firebase-uid-1");

  assert.deepEqual(calls, ["boot-1234"]);
});

test("usage reporter retries a failed send with the same clientSessionId", async () => {
  const calls = [];
  let attempt = 0;
  const reporter = createAccountUsageSessionReporter({
    apiClient: {
      async recordUsageSession(clientSessionId) {
        calls.push(clientSessionId);
        attempt += 1;
        if (attempt === 1) {
          throw new Error("temporary");
        }
        return { isNew: true, totalSessions: 2, lastSessionAt: "2026-10-08T06:01:00.000Z" };
      },
    },
    clientSessionIdFactory: () => "boot-retry-1",
  });

  await assert.rejects(() => reporter.reportAuthenticatedBoot("firebase-uid-2"));
  await reporter.reportAuthenticatedBoot("firebase-uid-2");

  assert.deepEqual(calls, ["boot-retry-1", "boot-retry-1"]);
});

test("same page boot can record a different authenticated account without minting another boot id", async () => {
  const calls = [];
  let factoryCalls = 0;
  const reporter = createAccountUsageSessionReporter({
    apiClient: {
      async recordUsageSession(clientSessionId) {
        calls.push(clientSessionId);
        return { isNew: true, totalSessions: 1, lastSessionAt: "2026-10-08T06:02:00.000Z" };
      },
    },
    clientSessionIdFactory() {
      factoryCalls += 1;
      return "boot-shared-1";
    },
  });

  await reporter.reportAuthenticatedBoot("firebase-uid-a");
  await reporter.reportAuthenticatedBoot("firebase-uid-b");

  assert.equal(factoryCalls, 1);
  assert.deepEqual(calls, ["boot-shared-1", "boot-shared-1"]);
});
