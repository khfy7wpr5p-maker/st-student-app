import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

const PACKAGE_ID = "pkg-violin-follow-browser";

function browserType() {
  const name = process.env.ST_BROWSER ?? "chromium";
  const type = { chromium, webkit }[name];
  assert.ok(type, "Unsupported ST_BROWSER: " + name);
  return type;
}

function scoreXml() {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<score-partwise version="4.0">' +
    '<part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>' +
    '<part id="P1">' +
    '<measure number="1">' +
    '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' +
    '<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>' +
    '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>' +
    '<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>' +
    '<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>' +
    '</measure>' +
    '<measure number="2">' +
    '<note><rest/><duration>1</duration><voice>1</voice></note>' +
    '<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>' +
    '<note><chord/><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>' +
    '<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>' +
    '</measure>' +
    '</part></score-partwise>'
  );
}

let server;
let baseUrl;

before(async () => {
  server = await startRepositoryStaticServer({
    htmlRoutes: Object.freeze({
      "/violin-follow-fixture":
        '<!doctype html><html lang="tr"><body>' +
        '<div id="score-active" aria-label="Aktif nota"></div>' +
        '<div data-violin-fingerboard aria-label="Birinci pozisyon keman klavyesi"></div>' +
        '</body></html>',
    }),
  });
  baseUrl = server.baseUrl;
});

after(async () => {
  await server?.close();
});

async function openFixture(page) {
  const response = await page.goto(baseUrl + "/violin-follow-fixture");
  assert.equal(response?.status(), 200);

  const xml = scoreXml();

  await page.evaluate(
    async ({ xml, packageId }) => {
      const scoreModule =
        await import("/src/practice/scoreFollowCoordinator.js");
      const violinModule =
        await import("/src/practice/violinFollowCoordinator.js");
      const fingerboardModule =
        await import("/src/ui/violinFingerboard.js");

      const pkg = Object.freeze({ packageId });
      const listeners = new Set();
      const rangeRequests = [];
      const plan = Object.freeze({
        schemaVersion: 1,
        quality: "FULL",
        packageId,
        referenceTempoBpm: 60,
        tempoMap: Object.freeze([
          Object.freeze({ beat: 0, bpm: 60 }),
        ]),
        measures: Object.freeze([
          Object.freeze({ index: 0, startBeat: 0, endBeat: 4 }),
          Object.freeze({ index: 1, startBeat: 4, endBeat: 8 }),
        ]),
        notes: Object.freeze([]),
      });

      const playbackPort = {
        getScoreFollowPlaybackContextForPackage() {
          return Object.freeze({
            plan,
            timingProvenance: Object.freeze({
              kind: "EXACT_SCORE_SOURCE",
              musicXml: xml,
            }),
          });
        },
        subscribePositionForPackage(_pkg, listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async playMeasureOnceForPackage(_pkg, range) {
          rangeRequests.push({
            startBeat: range.startBeat,
            endBeat: range.endBeat,
          });
        },
      };

      const scoreActive =
        document.querySelector("#score-active");
      const notationAdapter = {
        hitTestMeasureDetailed() {
          return {
            kind: "HIT",
            sourceId: packageId,
            renderEpoch: "browser-1",
            target: {
              partId: "P1",
              measureIndex: 0,
            },
          };
        },
        async moveCursor() {
          return true;
        },
        async clearHighlights() {
          scoreActive.textContent = "";
          return true;
        },
        async highlight(ref) {
          const token =
            ref.partId + ":" +
            ref.measureIndex + ":" +
            ref.voice + ":" +
            ref.noteIndex;
          scoreActive.textContent =
            scoreActive.textContent.length === 0
              ? token
              : scoreActive.textContent + "," + token;
          return true;
        },
      };

      const scoreFollow =
        scoreModule.createScoreFollowCoordinator({
          notationAdapter,
          playbackPort,
        });
      const fingerboard =
        fingerboardModule.createViolinFingerboardPresentation({
          root: document,
        });
      const violinFollow =
        violinModule.createViolinFollowCoordinator({
          playbackPort,
          presentationPort: fingerboard,
        });

      if (
        scoreFollow.bind({
          pkg,
          sourceId: packageId,
          musicXml: xml,
          renderEvidence: {
            sourceId: packageId,
            renderEpoch: "browser-1",
          },
        }) !== true
      ) {
        throw new Error("score follow bind failed");
      }

      if (
        violinFollow.bind({
          pkg,
          sourceId: packageId,
          musicXml: xml,
          targetPartId: "P1",
          stringLengthMm: 328,
        }) !== true
      ) {
        throw new Error("violin follow bind failed");
      }

      globalThis.__VIOLIN_FOLLOW_BROWSER__ = {
        tempoBpm: 60,
        rangeRequests,
        async emit(beat, playing = true) {
          for (const listener of [...listeners]) {
            listener({
              beat,
              playing,
              generation: 1,
            });
          }
          await new Promise((resolve) =>
            setTimeout(resolve, 25),
          );
        },
        setTempo(bpm) {
          this.tempoBpm = bpm;
        },
        async replayFirstMeasure() {
          return scoreFollow.handlePoint({
            clientX: 10,
            clientY: 10,
          });
        },
        async dispose() {
          await scoreFollow.dispose();
          await violinFollow.dispose();
        },
      };
    },
    { xml, packageId: PACKAGE_ID },
  );
}

async function fingerboardState(page) {
  return page.locator("[data-violin-fingerboard]").evaluate(
    (element) => ({
      html: element.innerHTML,
      text: element.textContent,
      playing:
        element.querySelector("[data-playing]")
          ?.getAttribute("data-playing") ?? null,
      activeString:
        element.querySelector("[data-active-string]")
          ?.getAttribute("data-active-string") ?? null,
      finger:
        element.querySelector("[data-finger]")
          ?.getAttribute("data-finger") ?? null,
      placement:
        element.querySelector("[data-placement]")
          ?.getAttribute("data-placement") ?? null,
      stopRatio:
        element.querySelector("[data-stop-ratio]")
          ?.getAttribute("data-stop-ratio") ?? null,
    }),
  );
}

test(
  "D-E-F#-G playback drives score identity and physically scaled first-position fingerboard",
  { timeout: 90_000 },
  async () => {
    const browser = await browserType().launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) =>
      pageErrors.push(error.message),
    );

    try {
      await openFixture(page);

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(0),
      );
      let state = await fingerboardState(page);
      assert.match(state.text, /Açık Re teli/);
      assert.equal(state.activeString, "D");
      assert.equal(state.finger, null);
      assert.match(
        await page.locator("#score-active").textContent(),
        /P1:0:1:0/,
      );

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(1),
      );
      state = await fingerboardState(page);
      assert.match(state.text, /Mi/);
      assert.match(state.text, /Birinci parmak/);
      assert.equal(state.activeString, "D");
      assert.equal(state.finger, "1");
      assert.equal(state.placement, "NORMAL");

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(2),
      );
      state = await fingerboardState(page);
      assert.match(state.text, /Fa diyez/);
      assert.equal(state.activeString, "D");
      assert.equal(state.finger, "2");
      assert.equal(state.placement, "HIGH");
      assert.ok(
        Math.abs(Number(state.stopRatio) - 0.2062994740159002) < 1e-12,
      );
      assert.match(state.html, /20\.6299/);
      assert.doesNotMatch(state.html, /25(?:\.0+)?%/);

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(3),
      );
      state = await fingerboardState(page);
      assert.match(state.text, /Sol/);
      assert.equal(state.activeString, "D");
      assert.equal(state.finger, "3");
      assert.equal(state.placement, "NORMAL");

      assert.deepEqual(pageErrors, []);
    } finally {
      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__?.dispose(),
      ).catch(() => {});
      await context.close();
      await browser.close();
    }
  },
);

test(
  "pause restart tempo change measure replay rest and chord remain on the single playback position stream",
  { timeout: 90_000 },
  async () => {
    const browser = await browserType().launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
    });
    const page = await context.newPage();

    try {
      await openFixture(page);

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(2),
      );
      let state = await fingerboardState(page);
      assert.match(state.text, /Fa diyez/);

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(2, false),
      );
      state = await fingerboardState(page);
      assert.equal(state.playing, "false");
      assert.match(state.text, /Fa diyez/);

      await page.evaluate(() => {
        globalThis.__VIOLIN_FOLLOW_BROWSER__.setTempo(96);
      });
      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(2, true),
      );
      state = await fingerboardState(page);
      assert.match(state.text, /Fa diyez/);
      assert.equal(state.finger, "2");

      assert.equal(
        await page.evaluate(() =>
          globalThis.__VIOLIN_FOLLOW_BROWSER__.replayFirstMeasure(),
        ),
        true,
      );
      assert.deepEqual(
        await page.evaluate(() =>
          globalThis.__VIOLIN_FOLLOW_BROWSER__.rangeRequests.at(-1),
        ),
        { startBeat: 0, endBeat: 4 },
      );

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(0, true),
      );
      state = await fingerboardState(page);
      assert.match(state.text, /Açık Re teli/);

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(4, true),
      );
      state = await fingerboardState(page);
      assert.match(state.text, /Çalma başladığında/);
      assert.equal(state.finger, null);

      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__.emit(5, true),
      );
      state = await fingerboardState(page);
      assert.match(state.text, /Çalma başladığında/);
      assert.equal(state.finger, null);
    } finally {
      await page.evaluate(() =>
        globalThis.__VIOLIN_FOLLOW_BROWSER__?.dispose(),
      ).catch(() => {});
      await context.close();
      await browser.close();
    }
  },
);