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
    'self.addEventListener("fetch", () => {})\n',
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

test("pilot preview injects bounded runtime config before main module", async () => {
  const sourceRoot = await fixture();
  const outputDir = path.join(sourceRoot, "out");

  await assembleStudent08PilotPreview({
    sourceRoot,
    outputDir,
    apiBaseUrl:
      "https://seslitab-s08-3-pilot-api.onrender.com/api/secure-delivery/v1/",
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
    /https:\/\/seslitab-s08-3-pilot-api\.onrender\.com\/api\/secure-delivery\/v1/,
  );
  assert.doesNotMatch(
    config,
    /Authorization|Bearer|token/i,
  );
  assert.equal(head, "abc123\n");

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

test("pilot preview rejects non-HTTPS or malformed API URLs", async () => {
  const sourceRoot = await fixture();
  const outputDir = path.join(sourceRoot, "out");

  for (const apiBaseUrl of [
    "http://example.test/api",
    "not a url",
    "https://user:pass@example.test/api",
  ]) {
    await assert.rejects(
      () =>
        assembleStudent08PilotPreview({
          sourceRoot,
          outputDir,
          apiBaseUrl,
          headSha: "abc123",
        }),
      /HTTPS|URL|credentials/i,
    );
  }
});
