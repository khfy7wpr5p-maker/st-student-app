import test from "node:test";
import assert from "node:assert/strict";

import { createAccountServiceApiClient } from "../src/providers/accountService/accountServiceApiClient.js";

test("usage session posts only clientSessionId with a fresh Firebase bearer token", async () => {
  const requests = [];
  let tokenCalls = 0;
  const client = createAccountServiceApiClient({
    baseUrl: "https://accounts.example.test/api/student-accounts/v1",
    async getIdToken() {
      tokenCalls += 1;
      return `token-${tokenCalls}`;
    },
    async fetchImpl(url, options) {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            isNew: true,
            totalSessions: 4,
            lastSessionAt: "2026-10-08T06:10:00.000Z",
          };
        },
      };
    },
  });

  const result = await client.recordUsageSession("boot-abc_123");

  assert.equal(tokenCalls, 1);
  assert.equal(
    requests[0].url,
    "https://accounts.example.test/api/student-accounts/v1/student/sessions",
  );
  assert.equal(requests[0].options.headers.Authorization, "Bearer token-1");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    clientSessionId: "boot-abc_123",
  });
  assert.equal(result.totalSessions, 4);
});

test("usage session rejects identifiers outside the backend path-safe contract before fetch", () => {
  let fetchCalls = 0;
  const client = createAccountServiceApiClient({
    baseUrl: "https://accounts.example.test/api/student-accounts/v1",
    getIdToken: async () => "token",
    async fetchImpl() {
      fetchCalls += 1;
      throw new Error("must not fetch");
    },
  });

  assert.throws(() => client.recordUsageSession("bad session id"), TypeError);
  assert.throws(() => client.recordUsageSession("x".repeat(161)), TypeError);
  assert.equal(fetchCalls, 0);
});
