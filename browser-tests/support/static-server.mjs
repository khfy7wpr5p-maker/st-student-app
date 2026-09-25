import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

export const SES13_E2E_PATH = "/__ses13__/";

export const SES13_E2E_DOCUMENT = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <base href="/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ST Student SES-13 E2E</title>
    <script type="importmap">
    {
      "imports": {
        "@st/score-renderer-contracts": "/vendor/st-score-runtime/modules/contracts.js",
        "@st/score-renderer-core": "/vendor/st-score-runtime/modules/renderer-core.js",
        "@st/score-renderer-osmd": "/vendor/st-score-runtime/modules/adapter-osmd.js",
        "@st/score-renderer-browser-host": "/vendor/st-score-runtime/modules/browser-host.js",
        "opensheetmusicdisplay": "/vendor/st-score-runtime/modules/osmd-module-shim.mjs"
      }
    }
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/browser-tests/support/student-app-e2e-bootstrap.mjs"></script>
  </body>
</html>`;

export async function startRepositoryStaticServer({
  publicRoot = resolve("."),
  htmlRoutes = Object.freeze({
    [SES13_E2E_PATH]: SES13_E2E_DOCUMENT,
  }),
} = {}) {
  let server;

  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );

    if (Object.hasOwn(htmlRoutes, pathname)) {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(htmlRoutes[pathname]);
      return;
    }

    const target = resolve(publicRoot, "." + pathname);
    if (
      target !== publicRoot &&
      !target.startsWith(publicRoot + sep)
    ) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await readFile(target);
      response
        .writeHead(200, {
          "content-type":
            MIME_TYPES[extname(target)] ?? "application/octet-stream",
          "cache-control": "no-store",
        })
        .end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((done) =>
    server.listen(0, "127.0.0.1", done),
  );

  const address = server.address();
  const baseUrl =
    `http://127.0.0.1:${address.port}`;

  return Object.freeze({
    baseUrl,
    close() {
      return new Promise((done) =>
        server.close(done),
      );
    },
  });
}
