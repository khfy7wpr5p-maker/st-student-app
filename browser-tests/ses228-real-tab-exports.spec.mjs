import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

const CASES = Object.freeze([
  Object.freeze({
    name: "Blue Bossa Solo",
    file: new URL("./fixtures/ses-228/blue-bossa-historical.musicxml", import.meta.url),
    expectedFrets: Object.freeze(["3", "12", "13", "14", "15", "17", "19", "20"]),
  }),
  Object.freeze({
    name: "Fikrimin İnce Gülü",
    file: new URL("./fixtures/ses-228/fikrimin-ince-gulu-historical.musicxml", import.meta.url),
    expectedFrets: Object.freeze(["6", "8", "10", "11", "12", "13", "14", "15", "17", "18", "19", "20"]),
  }),
]);

function postFixExport(historicalMusicXml) {
  return historicalMusicXml.replace(
    /<note>[\s\S]*?<\/note>/g,
    (note) => note.includes("<staff>2</staff>")
      ? note.replace("<voice>1</voice>", "<voice>2</voice>")
      : note,
  );
}

function technicalFrets(musicXml) {
  return [...musicXml.matchAll(/<fret>(\d+)<\/fret>/g)]
    .map((match) => match[1]);
}

function voicesForStaff(musicXml, staff) {
  return new Set(
    [...musicXml.matchAll(/<note>[\s\S]*?<\/note>/g)]
      .map((match) => match[0])
      .filter((note) => note.includes(`<staff>${staff}</staff>`))
      .flatMap((note) => [...note.matchAll(/<voice>([^<]+)<\/voice>/g)])
      .map((match) => match[1]),
  );
}

let server;

before(async () => {
  server = await startRepositoryStaticServer();
});

after(async () => {
  await server?.close();
});

for (const fixture of CASES) {
  test(`SES-228 ${fixture.name} renders every authored nonzero fret`, { timeout: 60_000 }, async () => {
    const historicalMusicXml = await readFile(fixture.file, "utf8");
    const musicxml = postFixExport(historicalMusicXml);
    const notationVoices = voicesForStaff(musicxml, 1);
    const tabVoices = voicesForStaff(musicxml, 2);

    assert.deepEqual([...notationVoices], ["1"]);
    assert.deepEqual([...tabVoices], ["2"]);
    assert.deepEqual(
      [...new Set(technicalFrets(musicxml))].sort((left, right) => Number(left) - Number(right)),
      fixture.expectedFrets,
      "fixture must retain its complete authored fret range",
    );

    const browserName = process.env.ST_BROWSER ?? "chromium";
    const browserType = { chromium, webkit }[browserName];
    assert.ok(browserType, `Unsupported ST_BROWSER: ${browserName}`);
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const response = await page.goto(`${server.baseUrl}/vendor/st-score-runtime/index.html`);
      assert.equal(response.status(), 200);
      await page.locator("html[data-st-score-runtime-ready='true']").waitFor();
      const result = await page.evaluate(async (source) => {
        return globalThis.__ST_SCORE_RENDER_HOST__.renderMusicXml({
          contractVersion: "0.2.0",
          musicxml: source,
          ticket: "ses-228",
          pageMode: "continuous",
          autoResize: true,
          drawTitle: false,
          drawComposer: false,
        });
      }, musicxml);

      assert.ok(result, "renderer should return a result");
      assert.deepEqual(pageErrors, [], "browser must not raise an uncaught rendering error");
      const visibleText = (await page.locator("#st-score-root svg text").allTextContents())
        .map((value) => value.trim())
        .filter(Boolean);
      for (const fret of fixture.expectedFrets) {
        assert.ok(visibleText.includes(fret), `TAB must display authored fret ${fret}`);
      }
    } finally {
      await browser.close();
    }
  });
}
