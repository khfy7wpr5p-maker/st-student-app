import test from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { startRepositoryStaticServer } from "./support/static-server.mjs";

test("Pool preserves empty, detail and navigation flows without horizontal scrolling", { timeout: 60000 }, async () => {
  const server = await startRepositoryStaticServer();
  let browser;
  try {
    browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? "chromium"]).launch({
      headless: true,
      ...(process.env.ST_BROWSER_EXECUTABLE ? { executablePath: process.env.ST_BROWSER_EXECUTABLE } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route("**/src/ui/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
    await page.goto(`${server.baseUrl}/index.html`);
    await page.evaluate(async () => {
      const [{ createStudentAppController }, { mountStudentAppPerfA }, { createStudentPerfAController, createStudentPerfAReadService }] = await Promise.all([
        import("/src/ui/studentAppController.js"), import("/src/ui/mountStudentAppPerfA.js"), import("/src/ui/studentPerfA.js"),
      ]);
      let rows = [];
      const service = createStudentPerfAReadService({
        listPoolItems: async () => rows,
        getPoolItem: async ({ poolItemId }) => rows.find(item => item.poolItemId === poolItemId),
        listPieces: async () => [], listAssignments: async () => [],
      });
      const base = createStudentAppController({ sharingService: {}, student08ReadService: service,
        initialSession: { studentId: "student-a" } });
      const app = createStudentPerfAController({ controller: base, readService: service });
      await app.showPublicPool();
      mountStudentAppPerfA({ root: document.getElementById("app"), controller: app });
      window.poolTest = { app, populate: () => { rows = [{ poolItemId: "pool-test", title: "Uzun_İçerik_Başlığı_".repeat(20), shortDescription: "Açıklama", detailText: "Birinci satır.\nİkinci satır.", publishedAt: "2026-10-20T08:00:00Z" }]; } };
    });
    await page.getByText("Havuzda henüz içerik yok.", { exact: true }).waitFor();
    assert.equal(await page.locator("aside").count(), 0);
    assert.equal(await page.locator(".pool-card").count(), 0);
    await page.locator(".pool-empty img").evaluate(img => img.decode());
    assert.ok(await page.locator(".pool-empty img").evaluate(img => img.naturalWidth > 0));
    await page.screenshot({ path: "/tmp/student-pool-empty.png", fullPage: true });
    await page.getByRole("button", { name: "← Ana ekran", exact: true }).click();
    await page.getByRole("button", { name: "Havuz", exact: true }).click();
    await page.locator(".work-menu summary").click();
    await page.getByRole("button", { name: "Benim Çalışmalarım", exact: true }).click();
    await page.getByRole("heading", { name: "Benim Çalışmalarım", exact: true }).waitFor();
    await page.locator(".work-menu summary").click();
    await page.getByRole("button", { name: "Havuz", exact: true }).click();
    await page.evaluate(() => window.poolTest.populate());
    await page.getByRole("button", { name: "← Ana ekran", exact: true }).click();
    await page.getByRole("button", { name: "Havuz", exact: true }).click();
    await page.locator(".pool-card").click();
    await page.getByText("Birinci satır.\nİkinci satır.", { exact: true }).waitFor();
    assert.equal(await page.locator('[data-action="open-assignment"]').count(), 0);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
