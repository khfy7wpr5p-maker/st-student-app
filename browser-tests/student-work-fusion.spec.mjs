import test from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { startRepositoryStaticServer } from "./support/static-server.mjs";

test("work screens preserve 50 titles, drafts, focus, submission and return folder", { timeout: 60000 }, async () => {
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
      let resolveRead, rejectRead;
      const calls = { reads: 0, posts: 0 };
      const readService = createStudentPerfAReadService({
        listPoolItems: async () => [],
        listPieces: async () => [],
        listAssignments: async ({ state }) => Array.from({ length: 50 }, (_, i) => ({
          assignmentId: `score-${i}`, title: i === 49 ? "Bülbülüm_Altın_Kafeste(Akor eşlik) — Uzun Türkçe Başlık" : `Gönderilen eser ${i + 1}`,
          practiceType: "SCORE", state, teacherNote: "", assignedAt: "2026-10-20T08:00:00Z",
        })),
        requestWork: async () => { calls.posts++; return {}; },
        listSharedWorkRequests: () => { calls.reads++; return new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }); },
      });
      const base = createStudentAppController({ sharingService: {}, student08ReadService: readService, initialSession: { studentId: "student-a" } });
      const app = createStudentPerfAController({ controller: base, readService });
      await app.showMyWork("REPERTOIRE");
      const mounted = mountStudentAppPerfA({ root: document.getElementById("app"), controller: app });
      window.workTest = { app, mounted, calls, resolveRead: rows => resolveRead(rows), rejectRead: () => rejectRead(new Error("network")) };
    });
    assert.equal(await page.locator('[data-action="open-assignment"]').count(), 50);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Eser İste", exact: true }).click();
    await page.getByLabel("Eser adı").waitFor();
    assert.equal(await page.evaluate(() => window.workTest.calls.reads), 1);
    const input = page.getByLabel("Eser adı");
    await input.fill("Fikrimin İnce Gülü");
    await input.evaluate(el => el.setSelectionRange(3, 8));
    await page.evaluate(() => window.workTest.resolveRead([{ title: "Etüt", displayNameOrNickname: "Ahmet" }]));
    await page.getByText("Ahmet", { exact: true }).waitFor();
    assert.equal(await input.inputValue(), "Fikrimin İnce Gülü");
    assert.equal(await input.evaluate(el => document.activeElement === el), true);
    assert.deepEqual(await input.evaluate(el => [el.selectionStart, el.selectionEnd]), [3, 8]);
    await page.getByRole("button", { name: "Gönder", exact: true }).click();
    await page.getByText("İsteğiniz öğretmeninize gönderildi.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.workTest.calls.posts), 1);
    assert.equal(await page.evaluate(() => window.workTest.calls.reads), 2);
    await page.evaluate(() => window.workTest.rejectRead());
    await page.getByRole("button", { name: "Listeyi yenile" }).waitFor();
    assert.equal(await page.getByText("İsteğiniz öğretmeninize gönderildi.", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "← Çalışmalarım", exact: true }).click();
    await page.getByRole("heading", { name: "Benim Çalışmalarım", exact: true }).waitFor();
    assert.equal(await page.locator('[data-assignment-state="REPERTOIRE"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-action="open-assignment"]').count(), 50);
    await page.screenshot({ path: "/tmp/student-work-fusion.png", fullPage: true });
  } finally {
    await browser?.close();
    await server.close();
  }
});
