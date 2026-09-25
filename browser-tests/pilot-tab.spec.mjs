import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";

// The production pilot fixture: two staves (notation + six-line TAB), frets 7 and 12.
const PILOT_TAB_MUSIC_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<score-partwise version="3.1">' +
  '<part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1"><attributes>' +
  '<divisions>1</divisions><key><fifths>0</fifths></key>' +
  '<time><beats>4</beats><beat-type>4</beat-type></time>' +
  '<staves>2</staves>' +
  '<clef number="1"><sign>G</sign><line>2</line></clef>' +
  '<clef number="2"><sign>TAB</sign><line>5</line></clef>' +
  '<staff-details number="2"><staff-lines>6</staff-lines>' +
  '<staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>' +
  '<staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>' +
  '<staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>' +
  '<staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>' +
  '<staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>' +
  '<staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>' +
  '</staff-details></attributes>' +
  '<note><pitch><step>B</step><octave>4</octave></pitch>' +
  '<duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>' +
  '<note><pitch><step>E</step><octave>5</octave></pitch>' +
  '<duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>' +
  '<backup><duration>4</duration></backup>' +
  '<note><pitch><step>B</step><octave>4</octave></pitch>' +
  '<duration>2</duration><voice>5</voice><type>half</type><staff>2</staff>' +
  '<notations><technical><string>1</string><fret>7</fret></technical></notations></note>' +
  '<note><pitch><step>E</step><octave>5</octave></pitch>' +
  '<duration>2</duration><voice>5</voice><type>half</type><staff>2</staff>' +
  '<notations><technical><string>1</string><fret>12</fret></technical></notations></note>' +
  '</measure></part></score-partwise>';

const publicRoot = resolve(".");
const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
let server;
let baseUrl;

before(async () => {
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = resolve(publicRoot, "." + pathname);
    if (!target.startsWith(publicRoot + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      const extension = target.slice(target.lastIndexOf("."));
      response.writeHead(200, { "content-type": mimeTypes[extension] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((done) => server.close(done));
});

test("pilot guitar TAB draws visible SVG and frets 7/12 at iPhone width", { timeout: 60_000 }, async () => {
  const browserName = process.env.ST_BROWSER ?? "chromium";
  const browserType = { chromium, webkit }[browserName];
  assert.ok(browserType, `Unsupported ST_BROWSER: ${browserName}`);
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(`${baseUrl}/vendor/st-score-runtime/index.html`);
    assert.equal(response.status(), 200);
    await page.locator("html[data-st-score-runtime-ready='true']").waitFor();
    const result = await page.evaluate(async (musicxml) => {
      const host = globalThis.__ST_SCORE_RENDER_HOST__;
      return host.renderMusicXml({
        contractVersion: "0.2.0",
        musicxml,
        ticket: "1",
        pageMode: "continuous",
        autoResize: true,
        drawTitle: false,
        drawComposer: false,
      });
    }, PILOT_TAB_MUSIC_XML);
    assert.ok(result, "renderer should return a result");
    assert.deepEqual(pageErrors, [], "browser must not raise an uncaught rendering error");
    const svg = page.locator("#st-score-root svg");
    assert.ok(await svg.count(), "TAB card must contain an SVG");
    const visibleText = (await svg.locator("text").allTextContents())
      .map((text) => text.trim())
      .filter(Boolean);
    assert.ok(visibleText.includes("7"), "TAB must display fret 7");
    assert.ok(visibleText.includes("12"), "TAB must display fret 12");
    assert.ok(
      await svg.first().evaluate((element) => element.getBoundingClientRect().height > 0),
      "score SVG must occupy visible height",
    );
  } finally {
    await browser.close();
  }
});
