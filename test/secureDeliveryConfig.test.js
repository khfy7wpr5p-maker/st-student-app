import test from "node:test";
import assert from "node:assert/strict";

import {
  createSecureDeliveryConfig,
} from "../src/config/secureDeliveryConfig.js";

test("Secure Delivery config is disabled when endpoint is absent", () => {
  assert.deepEqual(
    createSecureDeliveryConfig({}),
    Object.freeze({
      enabled: false,
      baseUrl: null,
    }),
  );
});

test("Secure Delivery config accepts and normalizes explicit HTTPS endpoint", () => {
  assert.deepEqual(
    createSecureDeliveryConfig({
      VITE_SECURE_DELIVERY_API_BASE_URL:
        "https://student-api.example.test/api/secure-delivery/v1/",
    }),
    Object.freeze({
      enabled: true,
      baseUrl:
        "https://student-api.example.test/api/secure-delivery/v1",
    }),
  );
});

test("Secure Delivery config rejects non-HTTPS endpoint", () => {
  assert.throws(
    () => createSecureDeliveryConfig({
      VITE_SECURE_DELIVERY_API_BASE_URL:
        "http://example.test/api",
    }),
    /https/i,
  );
});
