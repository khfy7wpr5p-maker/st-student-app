import test from "node:test";
import assert from "node:assert/strict";

import { createFirebaseDatabaseConfig } from "../src/config/firebaseConfig.js";

test("Firebase database config accepts exact Firebase RTDB HTTPS origins", () => {
  for (const value of [
    "https://st-student-app-85cde-default-rtdb.firebaseio.com",
    "https://st-student-app-85cde-default-rtdb.europe-west1.firebasedatabase.app",
  ]) {
    assert.deepEqual(
      createFirebaseDatabaseConfig({ VITE_FIREBASE_DATABASE_URL: value }),
      { enabled: true, url: value },
    );
  }
});

test("Firebase database config fails closed for missing or unsafe URLs", () => {
  for (const value of [
    undefined,
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

test("Firebase database config reads the bounded runtime config fallback", () => {
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
