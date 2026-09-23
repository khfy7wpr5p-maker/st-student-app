import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("pilot preview loads runtime config before the Student App module", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  const configIndex = html.indexOf(
    '<script src="./pilot-runtime-config.js"></script>',
  );
  const mainIndex = html.indexOf(
    '<script type="module" src="./src/ui/main.js"></script>',
  );

  assert.notEqual(configIndex, -1);
  assert.notEqual(mainIndex, -1);
  assert.ok(configIndex < mainIndex);
});

test("pilot build emits only bounded app assets and validates HTTPS API configuration", async () => {
  const source = await readFile(
    new URL(
      "../scripts/build-student08-pilot.mjs",
      import.meta.url,
    ),
    "utf8",
  );

  for (const required of [
    "dist-pilot",
    "index.html",
    "service-worker.js",
    "src",
    "vendor",
    "SECURE_DELIVERY_API_BASE_URL",
    "https:",
    "pilot-runtime-config.js",
  ]) {
    assert.equal(source.includes(required), true);
  }

  assert.equal(source.includes("test/"), false);
  assert.equal(source.includes("docs/"), false);
});

test("pilot service worker caches every Secure Delivery runtime module needed offline", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  for (const asset of [
    "./pilot-runtime-config.js",
    "./src/config/secureDeliveryConfig.js",
    "./src/providers/secureDelivery/secureDeliveryApiClient.js",
    "./src/contracts/studentPoolView.js",
    "./src/contracts/secureDeliveryAssignment.js",
    "./src/contracts/privateAssignment.js",
    "./src/sharing/secureDeliveryStudent08ReadService.js",
    "./src/practice/practiceAccessRef.js",
    "./src/offline/secureDeliveryOfflineReadService.js",
    "./src/offline/secureDeliveryStatusService.js",
    "./src/ui/student08Composition.js",
  ]) {
    assert.equal(source.includes(asset), true);
  }
});
