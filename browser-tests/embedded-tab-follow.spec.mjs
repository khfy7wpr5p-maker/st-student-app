import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium, webkit } from "playwright";
import { startRepositoryStaticServer } from "./support/static-server.mjs";

test("real Smells source highlights notation and TAB with the production resolver and renderer", { timeout: 60_000 }, async () => {
  const browserType = { chromium, webkit }[process.env.ST_BROWSER ?? "chromium"];
  assert.ok(browserType, "unsupported browser");
  const server = await startRepositoryStaticServer();
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.baseUrl}/vendor/st-score-runtime/index.html`);
    await page.locator("html[data-st-score-runtime-ready='true']").waitFor();
    const xml = await readFile(new URL("../test/fixtures/score-follow/smellstab-guitar-tab.musicxml", import.meta.url), "utf8");
    const result = await page.evaluate(async (musicXml) => {
      const { createStNotationAdapter } = await import("/src/practice/notationAdapter.js");
      const { createPlaybackPlanResolver } = await import("/src/playback/playbackPlanResolver.js");
      const { createScoreFollowCoordinator } = await import("/src/practice/scoreFollowCoordinator.js");
      const pkg = { packageId: "smells-embedded", content: { score: { format: "musicxml", data: musicXml } } };
      const playbackContext = createPlaybackPlanResolver().resolvePackageContext(pkg);
      if (!playbackContext) throw new Error("fixture playback plan unavailable");
      const adapter = createStNotationAdapter();
      const render = await adapter.render({ musicXml, sourceId: pkg.packageId });
      let listener;
      const coordinator = createScoreFollowCoordinator({
        notationAdapter: adapter,
        playbackPort: {
          getScoreFollowPlaybackContextForPackage: () => playbackContext,
          subscribePositionForPackage(_pkg, callback) { listener = callback; return () => { listener = null; }; },
        },
      });
      const bound = coordinator.bind({ pkg, musicXml, sourceId: pkg.packageId, renderEvidence: render.evidence });
      if (!bound) throw new Error("fixture follow binding unavailable");
      // Drive the real coordinator with the unchanged production plan's clock.
      listener({ beat: playbackContext.plan.notes[0].startBeat });
      globalThis.__embeddedTabFollow = coordinator;
      return { capability: render.capability, measures: playbackContext.plan.measures.length, notes: playbackContext.plan.notes.length };
    }, xml);
    assert.deepEqual(result, { capability: "AVAILABLE", measures: 17, notes: 150 });
    await page.waitForFunction(() => {
      const root = document.querySelector("#st-score-root");
      return root?.querySelector('.vf-tabnote[data-st-score-highlight="true"]') &&
        root?.querySelector('[data-st-score-highlight="true"]:not(.vf-tabnote)');
    });
    const painted = await page.locator('#st-score-root [data-st-score-highlight="true"]').evaluateAll((elements) =>
      elements.map((element) => ({
        tab: element.classList.contains("vf-tabnote"),
        orange: element.getAttribute("fill") === "#ff8c00" && element.getAttribute("stroke") === "#ff8c00",
        visible: element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0,
      })),
    );
    assert.ok(painted.some((item) => item.tab && item.orange && item.visible), "TAB fret glyph must be visibly orange");
    assert.ok(painted.some((item) => !item.tab && item.orange && item.visible), "notation notehead must be visibly orange");
    await page.evaluate(() => globalThis.__embeddedTabFollow.clear());
    assert.equal(await page.locator('#st-score-root [data-st-score-highlight="true"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
