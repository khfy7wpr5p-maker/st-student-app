import test from "node:test";
import assert from "node:assert/strict";

import { createAccountServiceConfig } from "../src/config/accountServiceConfig.js";

test("account service config appends the canonical API path for a secure origin", () => {
  assert.deepEqual(
    createAccountServiceConfig({
      VITE_ACCOUNT_SERVICE_API_BASE_URL: "https://accounts.example.test",
    }),
    {
      enabled: true,
      baseUrl: "https://accounts.example.test/api/student-accounts/v1",
    },
  );
});

test("account service config permits loopback http for local integration only", () => {
  assert.equal(
    createAccountServiceConfig({
      VITE_ACCOUNT_SERVICE_API_BASE_URL: "http://127.0.0.1:3000",
    }).enabled,
    true,
  );
  assert.equal(
    createAccountServiceConfig({
      VITE_ACCOUNT_SERVICE_API_BASE_URL: "http://accounts.example.test",
    }).enabled,
    false,
  );
});

test("account service config rejects embedded credentials and URL metadata", () => {
  for (const value of [
    "https://user:secret@accounts.example.test",
    "https://accounts.example.test?debug=1",
    "https://accounts.example.test#fragment",
  ]) {
    assert.equal(
      createAccountServiceConfig({
        VITE_ACCOUNT_SERVICE_API_BASE_URL: value,
      }).enabled,
      false,
      value,
    );
  }
});

test("account service config enables the production account API on the ST Student Render origin", () => {
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      origin: "https://st-student-app.onrender.com",
    },
  });

  try {
    assert.deepEqual(createAccountServiceConfig(), {
      enabled: true,
      baseUrl: "https://st-student-account-api.onrender.com/api/student-accounts/v1",
    });
  } finally {
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      Object.defineProperty(globalThis, "location", previousLocation);
    }
  }
});
