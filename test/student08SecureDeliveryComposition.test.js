import test from "node:test";
import assert from "node:assert/strict";

import {
  createStudent08Composition,
} from "../src/ui/student08Composition.js";

function authAdapter() {
  return Object.freeze({
    async getIdToken() {
      return "fresh-token";
    },
  });
}

function connectivityPort() {
  return Object.freeze({
    getState() {
      return "ONLINE";
    },
    subscribe() {
      return () => {};
    },
  });
}

test("disabled STUDENT-08 Secure Delivery composition exposes no network read service", () => {
  const composed =
    createStudent08Composition({
      config: {
        enabled: false,
        baseUrl: null,
      },
      authAdapter: authAdapter(),
      fetchImpl: async () => {
        throw new Error(
          "fetch must not run",
        );
      },
      connectivityPort:
        connectivityPort(),
      offlineRepository: null,
    });

  assert.deepEqual(composed, {
    student08ReadService: null,
    secureDeliveryStatusService:
      null,
  });
});

test("enabled composition creates bounded read/status services without exposing token/client", () => {
  const composed =
    createStudent08Composition({
      config: {
        enabled: true,
        baseUrl:
          "https://student-api.example.test/api/secure-delivery/v1",
      },
      authAdapter: authAdapter(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: [],
          };
        },
      }),
      connectivityPort:
        connectivityPort(),
      offlineRepository: null,
    });

  assert.equal(
    typeof composed.student08ReadService
      .listPoolItems,
    "function",
  );
  assert.equal(
    typeof composed
      .secureDeliveryStatusService
      .getAccessStatus,
    "function",
  );
  assert.equal(
    "apiClient" in composed,
    false,
  );
  assert.equal(
    "token" in composed,
    false,
  );
  assert.equal(
    JSON.stringify(composed).includes(
      "fresh-token",
    ),
    false,
  );
});

test("enabled composition wraps read service with offline repository when available", () => {
  const offlineRepository = {
    async putAuthorized() {},
    async getActiveByAccessRef() {
      return null;
    },
    async listAllForStudent() {
      return [];
    },
    async markRevoked() {},
    async markVerifiedActive() {},
  };

  const composed =
    createStudent08Composition({
      config: {
        enabled: true,
        baseUrl:
          "https://student-api.example.test/api/secure-delivery/v1",
      },
      authAdapter: authAdapter(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: [],
          };
        },
      }),
      connectivityPort:
        connectivityPort(),
      offlineRepository,
    });

  assert.equal(
    typeof composed.student08ReadService
      .getScorePracticeItem,
    "function",
  );
});
