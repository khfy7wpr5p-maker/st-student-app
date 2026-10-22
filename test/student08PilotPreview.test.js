import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  assembleStudent08PilotPreview,
} from "../scripts/assemble-s08-3-pilot-preview.mjs";

async function fixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "student08-pilot-preview-"),
  );
  await mkdir(path.join(root, "src", "ui"), {
    recursive: true,
  });
  await mkdir(path.join(root, "vendor"), {
    recursive: true,
  });

  await writeFile(
    path.join(root, "index.html"),
    [
      "<!doctype html>",
      "<html><body>",
      '<div id="app"></div>',
      '<script type="module" src="./src/ui/main.js"></script>',
      "</body></html>",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "service-worker.js"),
    [
      'const SHELL_ASSETS = Object.freeze([',
      '  "./index.html",',
      '  "./src/ui/main.js",',
      ']);',
      'self.addEventListener("fetch", () => {});',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "src", "ui", "main.js"),
    "export const ok = true;\n",
  );
  await writeFile(
    path.join(root, "vendor", "marker.txt"),
    "vendor\n",
  );

  return root;
}

test("SES-8 preview injects bounded runtime config before main and caches it only in assembled output", async () => {
  const sourceRoot = await fixture();
  const outputDir = path.join(sourceRoot, "out");

  await assembleStudent08PilotPreview({
    sourceRoot,
    outputDir,
    apiBaseUrl:
      "https://seslitab-ses8-acceptance-api.onrender.com/api/secure-delivery/v1/",
    headSha: "abc123",
  });

  const html = await readFile(
    path.join(outputDir, "index.html"),
    "utf8",
  );
  const config = await readFile(
    path.join(outputDir, "runtime-config.js"),
    "utf8",
  );
  const head = await readFile(
    path.join(outputDir, "pilot-head.txt"),
    "utf8",
  );
  const outputWorker = await readFile(
    path.join(outputDir, "service-worker.js"),
    "utf8",
  );
  const sourceWorker = await readFile(
    path.join(sourceRoot, "service-worker.js"),
    "utf8",
  );

  assert.match(
    html,
    /<script src="\.\/runtime-config\.js"><\/script>/,
  );
  assert.ok(
    html.indexOf("runtime-config.js") <
      html.indexOf("./src/ui/main.js"),
  );
  assert.match(
    config,
    /secureDeliveryApiBaseUrl/,
  );
  assert.match(
    config,
    /https:\/\/seslitab-ses8-acceptance-api\.onrender\.com\/api\/secure-delivery\/v1/,
  );
  assert.doesNotMatch(
    config,
    /Authorization|Bearer|token/i,
  );
  assert.equal(head, "abc123\n");

  assert.match(
    outputWorker,
    /\.\/runtime-config\.js/,
  );
  assert.doesNotMatch(
    sourceWorker,
    /\.\/runtime-config\.js/,
  );

  assert.equal(
    await readFile(
      path.join(outputDir, "src", "ui", "main.js"),
      "utf8",
    ),
    "export const ok = true;\n",
  );
  assert.equal(
    await readFile(
      path.join(outputDir, "vendor", "marker.txt"),
      "utf8",
    ),
    "vendor\n",
  );
});

test("SES-8 preview rejects non-HTTPS, credentialed, query or hash API URLs", async () => {
  const sourceRoot = await fixture();
  const outputDir = path.join(sourceRoot, "out");

  for (const apiBaseUrl of [
    "http://example.test/api",
    "not a url",
    "https://user:pass@example.test/api",
    "https://example.test/api?token=no",
    "https://example.test/api#fragment",
  ]) {
    await assert.rejects(
      () =>
        assembleStudent08PilotPreview({
          sourceRoot,
          outputDir,
          apiBaseUrl,
          headSha: "abc123",
        }),
      /HTTPS|URL|credentials|query|hash/i,
    );
  }
});

test("current Student App shell already carries Secure Delivery offline runtime assets", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  for (const asset of [
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
