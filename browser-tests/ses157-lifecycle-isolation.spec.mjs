import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

const SES157_PATH = "/__ses157__/";
const PIECE_TITLE =
  "SES-13 Öğrenci A Etüdü";
const SCORE_CHILD_TITLE =
  "SES-157 SCORE child";
const CHORD_CHILD_TITLE =
  "SES-157 CHORD child";

const SES157_DOCUMENT = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <base href="/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ST Student SES-157 E2E</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/browser-tests/support/ses157-lifecycle-bootstrap.mjs"></script>
  </body>
</html>`;

let server;
let baseUrl;

before(async () => {
  server = await startRepositoryStaticServer({
    htmlRoutes: Object.freeze({
      [SES157_PATH]: SES157_DOCUMENT,
    }),
  });
  baseUrl = server.baseUrl;
});

after(async () => {
  if (server) {
    await server.close();
  }
});

test(
  "SES-157 Piece stays one accessible work across ACTIVE and REPERTOIRE without child leakage",
  { timeout: 90_000 },
  async () => {
    const browserName =
      process.env.ST_BROWSER ?? "chromium";
    const browserType = {
      chromium,
      webkit,
    }[browserName];

    assert.ok(
      browserType,
      `Unsupported ST_BROWSER: ${browserName}`,
    );

    const browser = await browserType.launch({
      headless: true,
    });
    const context = await browser.newContext({
      viewport: {
        width: 390,
        height: 844,
      },
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    const pageErrors = [];

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    try {
      const response = await page.goto(
        `${baseUrl}${SES157_PATH}`,
      );

      assert.equal(response?.status(), 200);
      await page.locator(
        "html[data-ses157-e2e-ready='true']",
      ).waitFor();

      await page
        .getByRole("button", {
          name: "Benim Çalışmalarım",
          exact: true,
        })
        .click();

      await page
        .getByRole("heading", {
          name: "Benim Çalışmalarım",
          exact: true,
        })
        .waitFor();

      assert.equal(
        await page
          .getByRole("button", {
            name: PIECE_TITLE,
            exact: true,
          })
          .count(),
        1,
        "ACTIVE must show exactly one Piece row",
      );
      assert.equal(
        await page
          .getByText(SCORE_CHILD_TITLE, {
            exact: true,
          })
          .count(),
        0,
        "SCORE child must not leak as a standalone row",
      );
      assert.equal(
        await page
          .getByText(CHORD_CHILD_TITLE, {
            exact: true,
          })
          .count(),
        0,
        "CHORD child must not leak as a standalone row",
      );

      await page.evaluate(() => {
        globalThis.__ses157SetPieceState(
          "REPERTOIRE",
        );
      });

      await page
        .getByRole("button", {
          name: "Repertuarım",
          exact: true,
        })
        .click();

      assert.equal(
        await page
          .getByRole("button", {
            name: PIECE_TITLE,
            exact: true,
          })
          .count(),
        1,
        "REPERTOIRE must show the same Piece once",
      );
      assert.equal(
        await page
          .getByText(SCORE_CHILD_TITLE, {
            exact: true,
          })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText(CHORD_CHILD_TITLE, {
            exact: true,
          })
          .count(),
        0,
      );

      await page
        .getByRole("button", {
          name: "Aktif Çalışmalar",
          exact: true,
        })
        .click();

      assert.equal(
        await page
          .getByRole("button", {
            name: PIECE_TITLE,
            exact: true,
          })
          .count(),
        0,
        "moved Piece must not remain in ACTIVE",
      );
      assert.equal(
        await page
          .getByText(SCORE_CHILD_TITLE, {
            exact: true,
          })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText(CHORD_CHILD_TITLE, {
            exact: true,
          })
          .count(),
        0,
      );

      await page
        .getByRole("button", {
          name: "Repertuarım",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: PIECE_TITLE,
          exact: true,
        })
        .click();

      await page
        .getByRole("heading", {
          name: PIECE_TITLE,
          exact: true,
        })
        .waitFor();

      assert.equal(
        await page
          .getByRole("tab", {
            name: "Nota",
            exact: true,
          })
          .count(),
        1,
        "Piece must expose its SCORE view",
      );
      assert.equal(
        await page
          .getByRole("tab", {
            name: "Akorlar",
            exact: true,
          })
          .count(),
        1,
        "Piece must expose its chord view",
      );

      assert.deepEqual(
        pageErrors,
        [],
        "browser acceptance must not emit page errors",
      );
    } finally {
      await context.close();
      await browser.close();
    }
  },
);