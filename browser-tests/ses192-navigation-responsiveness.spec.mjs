import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

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

test(
  "SES-192 newest navigation wins and destination paints without score render",
  { timeout: 60_000 },
  async () => {
    const browserName = process.env.ST_BROWSER ?? "chromium";
    const browserType = { chromium, webkit }[browserName];
    assert.ok(browserType, `Unsupported ST_BROWSER: ${browserName}`);

    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(`${baseUrl}/index.html`);
      assert.equal(response.status(), 200);

      await page.evaluate(async () => {
        const [
          { createStudentSession },
          { createStudentAppController },
          { mountStudentAppPerfA },
          {
            createStudentPerfAController,
            createStudentPerfAReadService,
          },
        ] = await Promise.all([
          import("/src/auth/session.js"),
          import("/src/ui/studentAppController.js"),
          import("/src/ui/mountStudentAppPerfA.js"),
          import("/src/ui/studentPerfA.js"),
        ]);

        document.body.innerHTML = '<main id="ses192-root"></main>';
        const root = document.querySelector("#ses192-root");
        const pending = new Map();
        const metrics = {
          notationRenderCalls: 0,
          marks: {},
        };

        function deferredRead(key) {
          return new Promise((resolve) => {
            const queue = pending.get(key) ?? [];
            queue.push(resolve);
            pending.set(key, queue);
          });
        }

        const service = {
          listPieces() {
            return [];
          },
          listAssignments({ state }) {
            return deferredRead(`assignments:${state}`);
          },
          listPoolItems() {
            return deferredRead("pool");
          },
        };

        const readService = createStudentPerfAReadService(service);
        const baseController = createStudentAppController({
          sharingService: {},
          student08ReadService: readService,
          initialSession: createStudentSession({
            studentId: "student-a",
            displayName: "Ali",
          }),
        });
        const controller = createStudentPerfAController({
          controller: baseController,
          readService,
        });
        const notationAdapter = {
          isAvailable() {
            return true;
          },
          async render() {
            metrics.notationRenderCalls += 1;
            return { capability: "AVAILABLE" };
          },
          async dispose() {},
        };

        const mounted = mountStudentAppPerfA({
          root,
          controller,
          notationAdapter,
        });

        globalThis.__ses192 = {
          metrics,
          mounted,
          controller,
          mark(name) {
            metrics.marks[name] = performance.now();
          },
          elapsed(name) {
            return performance.now() - metrics.marks[name];
          },
          resolve(key, value = []) {
            const queue = pending.get(key) ?? [];
            const resolve = queue.shift();
            if (queue.length === 0) {
              pending.delete(key);
            } else {
              pending.set(key, queue);
            }
            if (typeof resolve !== "function") {
              throw new Error(`missing deferred read: ${key}`);
            }
            resolve(value);
          },
        };
      });

      const loading = page.getByText("Yükleniyor…", { exact: true });
      const myWorkHeading = page.getByRole("heading", {
        name: "Benim Çalışmalarım",
      });
      const poolHeading = page.getByRole("heading", { name: "Havuz" });

      await page.evaluate(() => globalThis.__ses192.mark("fresh"));
      await page.getByRole("button", { name: "Benim Çalışmalarım" }).click();
      await myWorkHeading.waitFor();
      await loading.waitFor();
      const freshPaintMs = await page.evaluate(() =>
        globalThis.__ses192.elapsed("fresh"),
      );
      assert.equal(
        await page.evaluate(() => globalThis.__ses192.metrics.notationRenderCalls),
        0,
      );

      await page.evaluate(() =>
        globalThis.__ses192.resolve("assignments:ACTIVE", []),
      );
      await loading.waitFor({ state: "detached" });

      const repertoireButton = page.locator(
        '[data-action="show-work-folder"][data-assignment-state="REPERTOIRE"]',
      );
      await page.evaluate(() => globalThis.__ses192.mark("warm"));
      await repertoireButton.click();
      await loading.waitFor();
      const warmPaintMs = await page.evaluate(() =>
        globalThis.__ses192.elapsed("warm"),
      );
      assert.equal(
        await repertoireButton.evaluate((node) =>
          document.activeElement === node,
        ),
        true,
      );

      await page.getByRole("button", { name: "Havuz" }).first().click();
      await poolHeading.waitFor();
      await loading.waitFor();
      await page.evaluate(() => globalThis.__ses192.resolve("pool", []));
      await loading.waitFor({ state: "detached" });
      await page.evaluate(() =>
        globalThis.__ses192.resolve("assignments:REPERTOIRE", []),
      );
      await poolHeading.waitFor();
      assert.equal(await myWorkHeading.count(), 0);

      await page.getByRole("button", { name: "Benim Çalışmalarım" }).click();
      await myWorkHeading.waitFor();
      await loading.waitFor();
      const completedButton = page.locator(
        '[data-action="show-work-folder"][data-assignment-state="COMPLETED"]',
      );
      await completedButton.click();
      await loading.waitFor();
      await page.evaluate(() =>
        globalThis.__ses192.resolve("assignments:COMPLETED", []),
      );
      await loading.waitFor({ state: "detached" });
      await page.evaluate(() =>
        globalThis.__ses192.resolve("assignments:ACTIVE", []),
      );
      await myWorkHeading.waitFor();
      await completedButton.waitFor();
      assert.equal(await completedButton.getAttribute("aria-current"), "page");

      const notationRenderCalls = await page.evaluate(() =>
        globalThis.__ses192.metrics.notationRenderCalls,
      );
      assert.equal(notationRenderCalls, 0);
      assert.ok(Number.isFinite(freshPaintMs) && freshPaintMs >= 0);
      assert.ok(Number.isFinite(warmPaintMs) && warmPaintMs >= 0);
      console.log(
        `SES-192 ${browserName} navigation presentation: fresh=${freshPaintMs.toFixed(2)}ms warm=${warmPaintMs.toFixed(2)}ms`,
      );

      const ariaLive = page.locator('[role="status"][aria-live="polite"]');
      assert.ok((await ariaLive.count()) >= 1);
      assert.deepEqual(pageErrors, []);

      await page.evaluate(() => globalThis.__ses192.mounted.destroy());
    } finally {
      await browser.close();
    }
  },
);