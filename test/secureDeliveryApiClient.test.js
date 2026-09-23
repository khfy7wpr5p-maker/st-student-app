import test from "node:test";
import assert from "node:assert/strict";

import {
  SecureDeliveryApiError,
  createSecureDeliveryApiClient,
} from "../src/providers/secureDelivery/secureDeliveryApiClient.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

test("Secure Delivery client uses a fresh token per request and exact student paths", async () => {
  const tokens = ["token-1", "token-2"];
  const calls = [];
  const client = createSecureDeliveryApiClient({
    baseUrl:
      "https://student-api.example.test/api/secure-delivery/v1",
    getIdToken: async () => tokens.shift(),
    fetchImpl: async (url, init) => {
      calls.push([
        url,
        init.method,
        init.headers.Authorization,
      ]);
      return jsonResponse({
        success: true,
        data: [],
      });
    },
  });

  await client.listStudentPool();
  await client.getStudentAssignment("assignment-a");

  assert.deepEqual(calls, [
    [
      "https://student-api.example.test/api/secure-delivery/v1/student/pool",
      "GET",
      "Bearer token-1",
    ],
    [
      "https://student-api.example.test/api/secure-delivery/v1/student/assignments/assignment-a",
      "GET",
      "Bearer token-2",
    ],
  ]);
  assert.equal("token" in client, false);
  assert.equal("getIdToken" in client, false);
  assert.equal(JSON.stringify(client).includes("token-1"), false);
});

test("Secure Delivery client exposes bounded errors without provider/token leakage", async () => {
  const client = createSecureDeliveryApiClient({
    baseUrl:
      "https://student-api.example.test/api/secure-delivery/v1",
    getIdToken: async () => "super-secret-token",
    fetchImpl: async () =>
      jsonResponse({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Kayıt bulunamadı.",
          providerDiagnostic: "internal-secret",
        },
      }, 404),
  });

  await assert.rejects(
    () => client.getStudentAssignment("assignment-a"),
    (error) => {
      assert.equal(error instanceof SecureDeliveryApiError, true);
      assert.equal(error.status, 404);
      assert.equal(error.code, "NOT_FOUND");
      assert.equal(error.message, "Secure Delivery request failed");
      assert.doesNotMatch(
        JSON.stringify(error),
        /super-secret-token|internal-secret/,
      );
      return true;
    },
  );
});

test("Secure Delivery client rejects malformed success payload", async () => {
  const client = createSecureDeliveryApiClient({
    baseUrl:
      "https://student-api.example.test/api/secure-delivery/v1",
    getIdToken: async () => "token",
    fetchImpl: async () =>
      jsonResponse({ success: false }),
  });

  await assert.rejects(
    () => client.listStudentAssignments(),
    /Secure Delivery request failed/,
  );
});
