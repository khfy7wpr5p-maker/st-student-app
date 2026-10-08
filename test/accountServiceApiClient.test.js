import test from "node:test";
import assert from "node:assert/strict";

import {
  AccountServiceApiError,
  createAccountServiceApiClient,
} from "../src/providers/accountService/accountServiceApiClient.js";

test("public invitation resolution sends the raw token only in the JSON body", async () => {
  const calls = [];
  const client = createAccountServiceApiClient({
    baseUrl: "https://accounts.example.test/api/student-accounts/v1",
    getIdToken: async () => "must-not-be-used",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            inviteId: "invite-1",
            studentDisplayNameOrNickname: "Ada",
            email: "ada@example.test",
            expiresAt: "2026-10-15T00:00:00.000Z",
            accountMode: "CREATE",
          };
        },
      };
    },
  });

  const result = await client.resolveInvitation("RAW_TOKEN_123");

  assert.equal(result.accountMode, "CREATE");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes("RAW_TOKEN_123"), false);
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    inviteToken: "RAW_TOKEN_123",
  });
});

test("authenticated invitation acceptance uses a fresh Firebase bearer token", async () => {
  const calls = [];
  const client = createAccountServiceApiClient({
    baseUrl: "https://accounts.example.test/api/student-accounts/v1",
    getIdToken: async () => "fresh-firebase-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            studentId: "student-stable-1",
            relationshipState: "ACTIVE",
          };
        },
      };
    },
  });

  const result = await client.acceptInvitation("RAW_TOKEN_123");

  assert.equal(result.studentId, "student-stable-1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer fresh-firebase-token");
  assert.equal(calls[0].url.includes("RAW_TOKEN_123"), false);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    inviteToken: "RAW_TOKEN_123",
  });
});

test("account service errors stay bounded and never echo provider details", async () => {
  const client = createAccountServiceApiClient({
    baseUrl: "https://accounts.example.test/api/student-accounts/v1",
    getIdToken: async () => "fresh-firebase-token",
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async json() {
        return {
          error: "SERVICE_UNAVAILABLE",
          internal: "projects/secret/databases/(default)/documents/private/path",
        };
      },
    }),
  });

  await assert.rejects(
    () => client.acceptInvitation("RAW_TOKEN_123"),
    (error) => {
      assert.equal(error instanceof AccountServiceApiError, true);
      assert.equal(error.status, 503);
      assert.equal(error.code, "SERVICE_UNAVAILABLE");
      assert.equal(JSON.stringify(error).includes("private/path"), false);
      assert.equal(JSON.stringify(error).includes("RAW_TOKEN_123"), false);
      return true;
    },
  );
});
