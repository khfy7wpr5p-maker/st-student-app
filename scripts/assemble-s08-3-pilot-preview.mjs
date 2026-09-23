import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizeApiBaseUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("pilot API URL is required");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError("pilot API URL is invalid");
  }

  if (url.protocol !== "https:") {
    throw new TypeError("pilot API URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new TypeError("pilot API URL must not contain credentials");
  }
  if (url.search || url.hash) {
    throw new TypeError("pilot API URL must not contain query or hash");
  }

  return url.toString().replace(/\/$/u, "");
}

function runtimeConfig(apiBaseUrl) {
  return [
    "globalThis.__ST_STUDENT_APP_CONFIG__ = Object.freeze({",
    `  secureDeliveryApiBaseUrl: ${JSON.stringify(apiBaseUrl)},`,
    "});",
    "",
  ].join("\n");
}

export async function assembleStudent08PilotPreview({
  sourceRoot,
  outputDir,
  apiBaseUrl,
  headSha = "unknown",
}) {
  if (typeof sourceRoot !== "string" || sourceRoot.length === 0) {
    throw new TypeError("sourceRoot is required");
  }
  if (typeof outputDir !== "string" || outputDir.length === 0) {
    throw new TypeError("outputDir is required");
  }

  const normalizedApi =
    normalizeApiBaseUrl(apiBaseUrl);

  await rm(outputDir, {
    recursive: true,
    force: true,
  });
  await mkdir(outputDir, {
    recursive: true,
  });

  await Promise.all([
    cp(
      path.join(sourceRoot, "src"),
      path.join(outputDir, "src"),
      { recursive: true },
    ),
    cp(
      path.join(sourceRoot, "vendor"),
      path.join(outputDir, "vendor"),
      { recursive: true },
    ),
    cp(
      path.join(sourceRoot, "service-worker.js"),
      path.join(outputDir, "service-worker.js"),
    ),
  ]);

  const indexPath =
    path.join(sourceRoot, "index.html");
  const html =
    await readFile(indexPath, "utf8");

  const mainTag =
    '<script type="module" src="./src/ui/main.js"></script>';

  if (!html.includes(mainTag)) {
    throw new Error(
      "student main module tag missing from index.html",
    );
  }

  const previewHtml = html.replace(
    mainTag,
    [
      '<script src="./runtime-config.js"></script>',
      mainTag,
    ].join("\n    "),
  );

  await Promise.all([
    writeFile(
      path.join(outputDir, "index.html"),
      previewHtml,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "runtime-config.js"),
      runtimeConfig(normalizedApi),
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "pilot-head.txt"),
      String(headSha || "unknown").trim() + "\n",
      "utf8",
    ),
  ]);
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const sourceRoot =
    process.cwd();
  const outputDir =
    path.resolve(
      sourceRoot,
      process.env
        .S08_3_PILOT_PUBLISH_DIR ??
        "dist/pilot",
    );

  await assembleStudent08PilotPreview({
    sourceRoot,
    outputDir,
    apiBaseUrl:
      process.env
        .S08_3_PILOT_API_BASE_URL,
    headSha:
      process.env.RENDER_GIT_COMMIT ??
      process.env.GITHUB_SHA ??
      "unknown",
  });
}
