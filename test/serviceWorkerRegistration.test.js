import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { registerStudentAppServiceWorker } from "../src/offline/serviceWorkerRegistration.js";

test("registration degrades safely when serviceWorker is unavailable", async () => {
  assert.deepEqual(
    await registerStudentAppServiceWorker({ navigatorObject: {} }),
    { registered: false },
  );
});

test("registration failure is bounded and does not expose provider error", async () => {
  const result = await registerStudentAppServiceWorker({
    navigatorObject: {
      serviceWorker: {
        async register() {
          throw new Error("browser internal registration detail");
        },
      },
    },
  });

  assert.deepEqual(result, { registered: false });
  assert.equal(
    JSON.stringify(result).includes("browser internal registration detail"),
    false,
  );
});

test("service worker caches only explicit app-shell assets plus pinned Firebase runtime", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /st-student-shell-v2/);
  assert.match(source, /index\.html/);
  assert.match(source, /src\/ui\/main\.js/);
  assert.match(source, /request\.method\s*!==\s*["']GET["']/);
  assert.match(source, /url\.origin\s*===\s*self\.location\.origin/);
  assert.match(source, /FIREBASE_RUNTIME_URLS\.has\(url\.href\)/);

  assert.doesNotMatch(
    source,
    /\/api\/|publicPublications|students\/\{|practicePackages|accessToken|refreshToken|firebase.*token/i,
  );
});

test("service worker fetch handler uses a static allowlist before Cache Storage", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /SHELL_ASSET_PATHS\.has\(url\.pathname\)/);
  assert.doesNotMatch(source, /caches\.match\(event\.request\)[\s\S]*without/i);
});


test("service worker explicitly caches only the Firebase browser modules used by the app", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /firebasejs\/12\.19\.0\/firebase-app\.js/);
  assert.match(source, /firebasejs\/12\.19\.0\/firebase-auth\.js/);
  assert.match(source, /firebasejs\/12\.19\.0\/firebase-firestore\.js/);
  assert.doesNotMatch(source, /firebase-analytics\.js|firebase-storage\.js/);
  assert.match(source, /FIREBASE_RUNTIME_URLS/);
});
