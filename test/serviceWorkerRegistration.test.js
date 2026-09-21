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

test("service worker caches only explicit same-origin app-shell assets", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /st-student-shell-v1/);
  assert.match(source, /index\.html/);
  assert.match(source, /src\/ui\/main\.js/);
  assert.match(source, /request\.method\s*!==\s*["']GET["']/);
  assert.match(source, /url\.origin\s*!==\s*self\.location\.origin/);

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
