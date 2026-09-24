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

test("service worker caches explicit app-shell and playback assets plus pinned Firebase runtime", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /st-student-shell-v14/);
  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /index\.html/);
  assert.match(source, /src\/ui\/main\.js/);
  assert.match(source, /src\/practice\/notationViewport\.js/);
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

test("service worker pins the local ST score runtime asset graph without private package data", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  for (const asset of [
    "vendor/st-score-runtime/browser-bootstrap.mjs",
    "vendor/st-score-runtime/runtime-manifest.json",
    "vendor/st-score-runtime/modules/adapter-osmd.js",
    "vendor/st-score-runtime/modules/browser-host.js",
    "vendor/st-score-runtime/modules/contracts.js",
    "vendor/st-score-runtime/modules/osmd-module-shim.mjs",
    "vendor/st-score-runtime/modules/renderer-core.js",
    "vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js",
  ]) {
    assert.equal(source.includes(asset), true);
  }
  assert.doesNotMatch(source, /practicePackages|accessToken|refreshToken/i);
});


test("an already controlled page reloads once when the fresh service worker takes control", async () => {
  let controllerChangeListener = null;
  let reloadCount = 0;

  const result = await registerStudentAppServiceWorker({
    navigatorObject: {
      serviceWorker: {
        controller: {},
        addEventListener(type, listener) {
          if (type === "controllerchange") {
            controllerChangeListener = listener;
          }
        },
        removeEventListener() {},
        async register() {
          controllerChangeListener?.();
          controllerChangeListener?.();
          return {};
        },
      },
    },
    locationObject: {
      reload() {
        reloadCount += 1;
      },
    },
  });

  assert.deepEqual(result, { registered: true });
  assert.equal(reloadCount, 1);
});
