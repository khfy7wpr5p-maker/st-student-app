import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { SES13_E2E_PATH, startRepositoryStaticServer } from "./support/static-server.mjs";

test("Fusion home fits phone/desktop and preserves real pool, work and sign-out navigation", { timeout: 90_000 }, async () => {
  const browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? "chromium"]).launch({
    headless: true,
    ...(process.env.ST_BROWSER_EXECUTABLE ? { executablePath: process.env.ST_BROWSER_EXECUTABLE } : {}),
  });
  const server = await startRepositoryStaticServer();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${server.baseUrl}${SES13_E2E_PATH}`);
    const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
    await page.addStyleTag({ content: index.match(/<style>([\s\S]*?)<\/style>/)[1] });
    await page.addStyleTag({ url: `${server.baseUrl}/src/ui/student-home-fusion.css` });
    const signIn = async () => {
      await page.locator("[data-sign-in-email]").fill("student-a@ses13.test");
      await page.locator("[data-sign-in-password]").fill("ses13-password");
      await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
      await page.getByRole("heading", { name: "Bugün ne çalıyoruz?", exact: true }).waitFor();
    };
    await signIn();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 390, 768, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
      assert.equal(await page.locator(".fusion-card").count(), 2);
      assert.ok(await page.locator(".fusion-art").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)));
      assert.ok(await page.evaluate(() => document.fonts.check('400 32px "ST Knewave"', "çalıyoruz?")));
      for (const button of await page.locator(".fusion-home button").all()) {
        const box = await button.boundingBox();
        assert.ok(box.height >= 44 && box.width >= 44);
      }
      if (process.env.ST_FUSION_SCREENSHOT_DIR) {
        await page.screenshot({ path: `${process.env.ST_FUSION_SCREENSHOT_DIR}/fusion-${width}.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Havuz", exact: true }).click();
    await page.getByRole("heading", { name: "Havuz", exact: true }).waitFor();
    assert.equal(await page.locator(".fusion-home").count(), 0);
    await page.getByRole("button", { name: "Çıkış", exact: true }).click();
    await signIn();
    await page.getByRole("button", { name: "Benim Çalışmalarım", exact: true }).click();
    await page.getByRole("heading", { name: "Benim Çalışmalarım", exact: true }).waitFor();
    const workMenu = page.locator('summary[aria-label="Öğrenci menüsü"]');
    await workMenu.click();
    assert.equal(await workMenu.evaluate((node) => node.parentElement.open), true);
    await page.getByRole("button", { name: "Çıkış", exact: true }).click();
    await signIn();
    await page.getByRole("button", { name: "Çıkış", exact: true }).click();
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});
