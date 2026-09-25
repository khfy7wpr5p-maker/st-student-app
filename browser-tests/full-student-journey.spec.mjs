import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  SES13_E2E_PATH,
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

const STUDENT_A_EMAIL = "student-a@ses13.test";
const STUDENT_A_PASSWORD = "ses13-password";
const STUDENT_A_PIECE = "SES-13 Öğrenci A Etüdü";
const STUDENT_B_PIECE = "SES-13 Öğrenci B Gizli Parçası";
const RAW_XML_MARKER = "SES13_RAW_XML_PRIVATE_MARKER";
const PACKAGE_MARKER = "ses13-score-package-a";

let server;
let baseUrl;

before(async () => {
  server = await startRepositoryStaticServer();
  baseUrl = server.baseUrl;
});

after(async () => {
  if (server) {
    await server.close();
  }
});

async function eventually(predicate, {
  timeoutMs = 10_000,
  intervalMs = 50,
} = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, intervalMs),
    );
  }

  return false;
}

async function visibleScoreSvg(page) {
  const svg = page.locator("#st-score-root svg").first();
  return (
    (await svg.count()) === 1 &&
    (await svg.evaluate(
      (element) =>
        element.getBoundingClientRect().height > 0,
    ))
  );
}

async function assertNoStudentLeakage(page) {
  const appHtml =
    await page.locator("#app").innerHTML();
  const appText =
    await page.locator("#app").innerText();

  assert.equal(
    appHtml.includes(RAW_XML_MARKER),
    false,
    "raw MusicXML must not appear in the student DOM",
  );
  assert.equal(
    appHtml.includes(PACKAGE_MARKER),
    false,
    "internal package identity must not appear in the student DOM",
  );
  assert.equal(
    /firebase|bearer|secure_delivery|debug/iu.test(appHtml),
    false,
    "provider/token/debug internals must not appear in the student DOM",
  );
  assert.equal(
    appText.includes(STUDENT_B_PIECE),
    false,
    "Student B content must never be visible to Student A",
  );
}

test(
  "SES-13 full Student App journey is release-safe",
  { timeout: 120_000 },
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
    const sampleResponses = new Set();

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (
        response.ok() &&
        response.url().includes(
          "/vendor/st-piano/samples/",
        )
      ) {
        sampleResponses.add(response.url());
      }
    });

    try {
      const response =
        await page.goto(
          `${baseUrl}${SES13_E2E_PATH}`,
        );

      assert.equal(
        response?.status(),
        200,
        "SES-13 E2E document must load",
      );

      const loginVisible = await eventually(
        async () =>
          (await page
            .locator("[data-sign-in-email]")
            .count()) === 1 &&
          (await page
            .locator("[data-sign-in-password]")
            .count()) === 1 &&
          (await page
            .getByRole("button", {
              name: "Giriş Yap",
              exact: true,
            })
            .count()) === 1,
      );

      assert.equal(
        loginVisible,
        true,
        "the real Student App must present a visible login",
      );

      await page
        .locator("[data-sign-in-email]")
        .fill(STUDENT_A_EMAIL);
      await page
        .locator("[data-sign-in-password]")
        .fill(STUDENT_A_PASSWORD);
      await page
        .getByRole("button", {
          name: "Giriş Yap",
          exact: true,
        })
        .click();

      await page
        .getByRole("heading", {
          name: "Çalışmalar",
          exact: true,
        })
        .waitFor();

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
            name: STUDENT_A_PIECE,
            exact: true,
          })
          .count(),
        1,
        "Student A must see the authorized Piece",
      );
      assert.equal(
        await page
          .getByText(STUDENT_B_PIECE, {
            exact: true,
          })
          .count(),
        0,
        "Student B Piece must be isolated",
      );

      await page
        .getByRole("button", {
          name: STUDENT_A_PIECE,
          exact: true,
        })
        .click();

      await page
        .getByRole("heading", {
          name: STUDENT_A_PIECE,
          exact: true,
        })
        .waitFor();

      assert.equal(
        await page
          .getByRole("tab", {
            name: "Nota",
            exact: true,
          })
          .getAttribute("aria-selected"),
        "true",
        "Piece must open on Nota",
      );
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "Nota must render a visible SVG",
      );

      await page
        .getByRole("tab", {
          name: "TAB",
          exact: true,
        })
        .click();

      assert.equal(
        await page
          .getByRole("tab", {
            name: "TAB",
            exact: true,
          })
          .getAttribute("aria-selected"),
        "true",
        "Nota → TAB must select TAB",
      );
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "TAB must render a visible SVG",
      );

      const tabTexts = (
        await page
          .locator("#st-score-root svg text")
          .allTextContents()
      )
        .map((value) => value.trim())
        .filter(Boolean);

      assert.ok(
        tabTexts.includes("7"),
        "TAB must display fret 7",
      );
      assert.ok(
        tabTexts.includes("12"),
        "TAB must display fret 12",
      );

      await page
        .getByRole("tab", {
          name: "Akorlar",
          exact: true,
        })
        .click();

      await page
        .locator("#chord-board-title")
        .waitFor();

      assert.equal(
        (
          await page
            .locator("#chord-board-title")
            .textContent()
        )?.trim(),
        "C",
        "Akorlar must show the expected chord identity",
      );
      assert.equal(
        await page
          .locator(".chord-diagram")
          .count(),
        1,
        "Akorlar must show one chord diagram",
      );

      await page
        .getByRole("tab", {
          name: "Nota",
          exact: true,
        })
        .click();

      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "Akorlar → Nota must recover notation",
      );

      await page
        .getByRole("button", {
          name: "Dinle",
          exact: true,
        })
        .click();

      assert.equal(
        await eventually(
          () => sampleResponses.size === 12,
          { timeoutMs: 20_000 },
        ),
        true,
        "playback must load the pinned piano sample bank",
      );
      assert.equal(
        await visibleScoreSvg(page),
        true,
        "notation must survive playback repaint",
      );

      await page
        .getByRole("button", {
          name: "Duraklat",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: "Baştan",
          exact: true,
        })
        .click();
      await new Promise((resolve) =>
        setTimeout(resolve, 100),
      );
      await page
        .getByRole("button", {
          name: "Duraklat",
          exact: true,
        })
        .click();

      assert.equal(
        await visibleScoreSvg(page),
        true,
        "Nota/TAB surface must remain usable after play/pause/restart",
      );

      await assertNoStudentLeakage(page);

      await page
        .getByRole("button", {
          name: "← Geri",
          exact: true,
        })
        .click();

      await page
        .getByRole("heading", {
          name: "Benim Çalışmalarım",
          exact: true,
        })
        .waitFor();

      await context.setOffline(true);
      await page.evaluate(() => {
        globalThis.dispatchEvent(
          new Event("offline"),
        );
      });

      await page
        .getByText("Çevrimdışı", {
          exact: false,
        })
        .first()
        .waitFor();

      await page
        .getByRole("button", {
          name: STUDENT_A_PIECE,
          exact: true,
        })
        .click();

      await page
        .getByRole("heading", {
          name: STUDENT_A_PIECE,
          exact: true,
        })
        .waitFor();

      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "cached Piece must reopen offline with Nota",
      );
      assert.equal(
        await page
          .getByText(STUDENT_B_PIECE, {
            exact: true,
          })
          .count(),
        0,
        "Student B must remain inaccessible offline",
      );

      await assertNoStudentLeakage(page);

      await context.setOffline(false);
      await page.evaluate(() => {
        globalThis.dispatchEvent(
          new Event("online"),
        );
      });

      await page
        .getByText("Çevrimiçi", {
          exact: false,
        })
        .first()
        .waitFor();

      await page
        .getByRole("tab", {
          name: "TAB",
          exact: true,
        })
        .click();
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "TAB must remain usable after reconnect",
      );

      await page
        .getByRole("tab", {
          name: "Nota",
          exact: true,
        })
        .click();
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "Nota must remain usable after reconnect",
      );

      assert.equal(
        await page
          .locator(".piece-workspace")
          .count(),
        1,
        "reconnect must not duplicate the Piece workspace",
      );
      assert.equal(
        await page
          .locator("#st-score-root")
          .count(),
        1,
        "reconnect must not duplicate the notation root",
      );

      await page
        .getByRole("button", {
          name: "Dinle",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: "Duraklat",
          exact: true,
        })
        .click();

      await assertNoStudentLeakage(page);

      assert.deepEqual(
        pageErrors,
        [],
        "full journey must not raise uncaught browser errors",
      );
    } finally {
      await context.setOffline(false).catch(
        () => {},
      );
      await context.close();
      await browser.close();
    }
  },
);
