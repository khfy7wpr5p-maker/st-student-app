import test from "node:test";
import assert from "node:assert/strict";

import {
  createFirebaseDatabaseConfig,
  firebaseConfig,
} from "../src/config/firebaseConfig.js";

const CONFIRMED_PRODUCTION_DATABASE_URL =
  "https://st-student-app-85cde-default-rtdb.europe-west1.firebasedatabase.app";

test("Firebase config pins the confirmed production RTDB URL", () => {
  assert.equal(
    firebaseConfig.databaseURL,
    CONFIRMED_PRODUCTION_DATABASE_URL,
  );
});

test("Firebase database config accepts exact Firebase RTDB HTTPS origins", () => {
  for (const value of [
    "https://st-student-app-85cde-default-rtdb.firebaseio.com",
    CONFIRMED_PRODUCTION_DATABASE_URL,
  ]) {
    assert.deepEqual(
      createFirebaseDatabaseConfig({ VITE_FIREBASE_DATABASE_URL: value }),
      { enabled: true, url: value },
    );
  }
});

test("Firebase database config fails closed for missing or unsafe URLs", () => {
  for (const value of [
    "",
    "http://st-student-app-85cde-default-rtdb.firebaseio.com",
    "https://user:pass@st-student-app-85cde-default-rtdb.firebaseio.com",
    "https://example.com",
    "https://st-student-app-85cde-default-rtdb.firebaseio.com/path",
    "https://st-student-app-85cde-default-rtdb.firebaseio.com?x=1",
  ]) {
    assert.deepEqual(
      createFirebaseDatabaseConfig({ VITE_FIREBASE_DATABASE_URL: value }),
      { enabled: false, url: null },
    );
  }
});

test("Firebase database config reads the bounded runtime config override", () => {
  const previous = globalThis.__ST_STUDENT_APP_CONFIG__;
  globalThis.__ST_STUDENT_APP_CONFIG__ = {
    firebaseDatabaseUrl:
      "https://st-student-app-85cde-default-rtdb.firebaseio.com",
  };

  try {
    assert.deepEqual(createFirebaseDatabaseConfig(), {
      enabled: true,
      url: "https://st-student-app-85cde-default-rtdb.firebaseio.com",
    });
  } finally {
    if (previous === undefined) {
      delete globalThis.__ST_STUDENT_APP_CONFIG__;
    } else {
      globalThis.__ST_STUDENT_APP_CONFIG__ = previous;
    }
  }
});

test("Firebase database config falls back to the confirmed production URL", () => {
  const previous = globalThis.__ST_STUDENT_APP_CONFIG__;
  delete globalThis.__ST_STUDENT_APP_CONFIG__;

  try {
    assert.deepEqual(createFirebaseDatabaseConfig(), {
      enabled: true,
      url: CONFIRMED_PRODUCTION_DATABASE_URL,
    });
  } finally {
    if (previous !== undefined) {
      globalThis.__ST_STUDENT_APP_CONFIG__ = previous;
    }
  }
});
