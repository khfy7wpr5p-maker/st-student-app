import {
  cp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(
  new URL("..", import.meta.url).pathname,
);
const outDir = resolve(root, "dist-pilot");

await rm(outDir, {
  recursive: true,
  force: true,
});
await mkdir(outDir, {
  recursive: true,
});

for (const entry of [
  "index.html",
  "service-worker.js",
  "src",
  "vendor",
]) {
  await cp(
    resolve(root, entry),
    resolve(outDir, entry),
    {
      recursive: true,
    },
  );
}

const raw =
  String(
    process.env
      .SECURE_DELIVERY_API_BASE_URL ??
      "",
  ).trim();

let config = {};

if (raw !== "") {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error(
      "SECURE_DELIVERY_API_BASE_URL must use https",
    );
  }

  config = {
    secureDeliveryApiBaseUrl:
      url.toString().replace(/\/$/u, ""),
  };
}

await writeFile(
  resolve(
    outDir,
    "pilot-runtime-config.js",
  ),
  "globalThis.__ST_STUDENT_APP_CONFIG__ = Object.freeze(" +
    JSON.stringify(config) +
    ");\n",
  "utf8",
);
