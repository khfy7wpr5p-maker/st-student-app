import test from "node:test";
import assert from "node:assert/strict";

import {
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

test("SES-190 client posts only work-request title and reads shared pending Havuz", async () => {
  const calls = [];
  const client = createSecureDeliveryApiClient({
    baseUrl: "https://student-api.example.test/api/secure-delivery/v1",
    getIdToken: async () => "student-token",
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        method: init.method,
        authorization: init.headers.Authorization,
        accept: init.headers.Accept,
        contentType: init.headers["Content-Type"] ?? null,
        body: init.body ?? null,
      });
      return jsonResponse({ success: true, data: [] });
    },
  });

  await client.requestStudentWork("Carcassi Op. 60 No. 3");
  await client.listSharedPendingWorkRequests();

  assert.deepEqual(calls, [
    {
      url: "https://student-api.example.test/api/secure-delivery/v1/student/work-requests",
      method: "POST",
      authorization: "Bearer student-token",
      accept: "application/json",
      contentType: "application/json",
      body: JSON.stringify({ title: "Carcassi Op. 60 No. 3" }),
    },
    {
      url: "https://student-api.example.test/api/secure-delivery/v1/student/work-requests/pending",
      method: "GET",
      authorization: "Bearer student-token",
      accept: "application/json",
      contentType: null,
      body: null,
    },
  ]);
});

test("SES-190 client rejects blank work-request title before fetch", () => {
  let calls = 0;
  const client = createSecureDeliveryApiClient({
    baseUrl: "https://student-api.example.test/api/secure-delivery/v1",
    getIdToken: async () => "student-token",
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ success: true, data: [] });
    },
  });

  assert.throws(
    () => client.requestStudentWork("   "),
    /title must be a non-empty string/,
  );
  assert.equal(calls, 0);
});
