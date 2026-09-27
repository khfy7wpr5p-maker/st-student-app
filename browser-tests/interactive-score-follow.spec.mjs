import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

const PACKAGE_ID = "pkg-follow-browser";

function browserType() {
  const name = process.env.ST_BROWSER ?? "chromium";
  const type = { chromium, webkit }[name];
  assert.ok(type, `Unsupported ST_BROWSER: ${name}`);
  return type;
}

function scoreXml(measureCount = 6) {
  const measures = [];

  for (let index = 0; index < measureCount; index += 1) {
    const attributes =
      index === 0
        ? "<attributes><divisions>1</divisions>" +
          "<key><fifths>0</fifths></key>" +
          "<time><beats>4</beats><beat-type>4</beat-type></time>" +
          "<clef><sign>G</sign><line>2</line></clef></attributes>"
        : "";

    const body =
      index === 0
        ? [
            "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>",
            "<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>",
            "<note><rest/><duration>1</duration><voice>1</voice><type>quarter</type></note>",
            "<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>",
          ].join("")
        : [
            "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>",
            "<note><rest/><duration>1</duration><voice>1</voice><type>quarter</type></note>",
            "<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>",
            "<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>",
          ].join("");

    measures.push(
      `<measure number="${index + 1}">${attributes}${body}</measure>`,
    );
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<score-partwise version="3.1">' +
    '<part-list><score-part id="P1"><part-name>Follow Test</part-name></score-part></part-list>' +
    `<part id="P1">${measures.join("")}</part>` +
    "</score-partwise>"
  );
}

let server;
let baseUrl;

before(async () => {
  server = await startRepositoryStaticServer({
    htmlRoutes: Object.freeze({
      "/": "<!doctype html><html><body>Student shell fixture</body></html>",
    }),
  });
  baseUrl = server.baseUrl;
});

after(async () => {
  await server?.close();
});

async function openRendererFixture(page) {
  const response = await page.goto(
    `${baseUrl}/vendor/st-score-runtime/index.html`,
  );
  assert.equal(response?.status(), 200);
  await page.locator(
    "html[data-st-score-runtime-ready='true']",
  ).waitFor();

  const xml = scoreXml();

  const setup = await page.evaluate(
    async ({ xml, packageId }) => {
      const {
        createStNotationAdapter,
      } = await import("/src/practice/notationAdapter.js");
      const {
        createScoreFollowCoordinator,
      } = await import(
        "/src/practice/scoreFollowCoordinator.js"
      );

      const baseAdapter = createStNotationAdapter({
        getRuntime: () =>
          globalThis.__ST_SCORE_RENDER_HOST__,
      });

      const cursorTargets = [];
      const highlightTargets = [];
      let clearHighlightCalls = 0;

      const adapter = {
        hitTestMeasureDetailed(point) {
          return baseAdapter.hitTestMeasureDetailed(point);
        },
        async moveCursor(target) {
          cursorTargets.push(structuredClone(target));
          return baseAdapter.moveCursor(target);
        },
        async clearHighlights() {
          clearHighlightCalls += 1;
          return baseAdapter.clearHighlights();
        },
        async highlight(target) {
          highlightTargets.push(structuredClone(target));
          return baseAdapter.highlight(target);
        },
      };

      const result = await baseAdapter.render({
        musicXml: xml,
        sourceId: packageId,
      });

      if (
        result?.capability !== "AVAILABLE" ||
        result?.evidence === undefined
      ) {
        throw new Error("renderer evidence unavailable");
      }

      const measures = Object.freeze(
        Array.from({ length: 6 }, (_, index) =>
          Object.freeze({
            index,
            startBeat: index * 4,
            endBeat: index * 4 + 4,
          }),
        ),
      );
      const plan = Object.freeze({
        schemaVersion: 1,
        quality: "FULL",
        packageId,
        referenceTempoBpm: 60,
        tempoMap: Object.freeze([
          Object.freeze({ beat: 0, bpm: 60 }),
        ]),
        measures,
        notes: Object.freeze([]),
      });
      const pkg = Object.freeze({ packageId });
      const rangeRequests = [];
      let positionListener = null;

      function makePlaybackPort(exactProvenance) {
        return {
          getScoreFollowPlaybackContextForPackage() {
            return Object.freeze({
              plan,
              timingProvenance:
                exactProvenance
                  ? Object.freeze({
                      kind: "EXACT_SCORE_SOURCE",
                      musicXml: xml,
                    })
                  : null,
            });
          },
          async playMeasureOnceForPackage(
            _pkg,
            range,
          ) {
            rangeRequests.push({
              startBeat: range.startBeat,
              endBeat: range.endBeat,
            });
          },
          subscribePositionForPackage(
            _pkg,
            listener,
          ) {
            positionListener = listener;
            return () => {
              if (positionListener === listener) {
                positionListener = null;
              }
            };
          },
        };
      }

      let coordinator =
        createScoreFollowCoordinator({
          notationAdapter: adapter,
          playbackPort:
            makePlaybackPort(true),
        });

      if (
        coordinator.bind({
          pkg,
          sourceId: packageId,
          musicXml: xml,
          renderEvidence: result.evidence,
        }) !== true
      ) {
        throw new Error("follow coordinator bind failed");
      }

      globalThis.__FOLLOW_TEST__ = {
        packageId,
        rangeRequests,
        cursorTargets,
        highlightTargets,
        get clearHighlightCalls() {
          return clearHighlightCalls;
        },
        async handlePoint(point) {
          return coordinator.handlePoint(point);
        },
        async emitPosition(snapshot) {
          positionListener?.(snapshot);
          await new Promise((resolve) =>
            setTimeout(resolve, 30),
          );
        },
        async useUnavailableEventProvenance() {
          await coordinator.clear();
          cursorTargets.length = 0;
          highlightTargets.length = 0;
          clearHighlightCalls = 0;
          coordinator =
            createScoreFollowCoordinator({
              notationAdapter: adapter,
              playbackPort:
                makePlaybackPort(false),
            });
          if (
            coordinator.bind({
              pkg,
              sourceId: packageId,
              musicXml: xml,
              renderEvidence: result.evidence,
            }) !== true
          ) {
            throw new Error(
              "unavailable-provenance bind failed",
            );
          }
        },
      };

      return result.evidence;
    },
    { xml, packageId: PACKAGE_ID },
  );

  assert.equal(setup.sourceId, PACKAGE_ID);
}

async function scanVisible(page, {
  requireLaterMeasure = false,
} = {}) {
  return page.evaluate(
    ({ requireLaterMeasure }) => {
      const host =
        globalThis.__ST_SCORE_RENDER_HOST__;
      const root =
        document.querySelector("#st-score-root");
      if (host === undefined || root === null) {
        throw new Error("renderer fixture unavailable");
      }

      const found = {
        note: null,
        rest: null,
        whitespace: null,
        outside: null,
        later: null,
      };

      function inspect(clientX, clientY) {
        if (
          clientX < 0 ||
          clientX >= window.innerWidth ||
          clientY < 0 ||
          clientY >= window.innerHeight
        ) {
          return;
        }

        let measure;
        let event;
        try {
          measure =
            host.hitTestMeasureDetailed({
              clientX,
              clientY,
            });
        } catch {
          return;
        }

        try {
          event =
            host.hitTestRenderedEventDetailed({
              clientX,
              clientY,
            });
        } catch {
          event = null;
        }

        const point = { clientX, clientY };

        if (
          found.note === null &&
          event?.kind === "HIT" &&
          event.target?.kind === "NOTE"
        ) {
          found.note = { point, event, measure };
        }

        if (
          found.rest === null &&
          event?.kind === "HIT" &&
          event.target?.kind === "REST"
        ) {
          found.rest = { point, event, measure };
        }

        if (
          found.whitespace === null &&
          measure?.kind === "HIT" &&
          event?.kind === "MISS"
        ) {
          found.whitespace = {
            point,
            measure,
            event,
          };
        }

        if (
          found.outside === null &&
          measure?.kind === "MISS"
        ) {
          found.outside = { point, measure };
        }

        if (
          found.later === null &&
          measure?.kind === "HIT" &&
          measure.target?.measureIndex > 0
        ) {
          found.later = { point, measure, event };
        }
      }

      const elements =
        root.querySelectorAll("svg *");
      for (const element of elements) {
        const rect =
          element.getBoundingClientRect();
        if (
          rect.width <= 1 ||
          rect.height <= 1 ||
          rect.bottom < 0 ||
          rect.top >= window.innerHeight ||
          rect.right < 0 ||
          rect.left >= window.innerWidth
        ) {
          continue;
        }

        const candidates = [
          [
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          ],
          [
            rect.left + rect.width * 0.25,
            rect.top + rect.height * 0.5,
          ],
          [
            rect.left + rect.width * 0.75,
            rect.top + rect.height * 0.5,
          ],
        ];

        for (const [clientX, clientY] of candidates) {
          inspect(clientX, clientY);
        }

        if (
          found.note !== null &&
          found.rest !== null &&
          (
            !requireLaterMeasure ||
            found.later !== null
          )
        ) {
          break;
        }
      }

      const rootRect = root.getBoundingClientRect();
      const top = Math.max(
        1,
        Math.floor(rootRect.top),
      );
      const bottom = Math.min(
        window.innerHeight - 2,
        Math.ceil(rootRect.bottom),
      );

      for (
        let clientY = top;
        clientY <= bottom &&
        (
          found.whitespace === null ||
          found.outside === null
        );
        clientY += 14
      ) {
        for (
          let clientX = 2;
          clientX < window.innerWidth - 2;
          clientX += 14
        ) {
          inspect(clientX, clientY);
        }
      }

      if (found.outside === null) {
        const outerCandidates = [
          [2, 2],
          [window.innerWidth - 3, 2],
          [2, window.innerHeight - 3],
          [
            window.innerWidth - 3,
            window.innerHeight - 3,
          ],
        ];
        for (
          const [clientX, clientY]
          of outerCandidates
        ) {
          inspect(clientX, clientY);
        }
      }

      return found;
    },
    { requireLaterMeasure },
  );
}

test(
  "real renderer SCORE geometry drives bounded replay, cursor, and exact highlights",
  { timeout: 120_000 },
  async () => {
    const browser = await browserType().launch({
      headless: true,
    });
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
      await openRendererFixture(page);

      let visible = await scanVisible(page);

      assert.notEqual(
        visible.note,
        null,
        "a rendered notehead point must be discoverable",
      );
      assert.notEqual(
        visible.rest,
        null,
        "a rendered rest point must be discoverable",
      );
      assert.notEqual(
        visible.whitespace,
        null,
        "true measure whitespace must be discoverable",
      );
      assert.notEqual(
        visible.outside,
        null,
        "an outside-measure point must be discoverable",
      );

      for (const key of [
        "note",
        "rest",
        "whitespace",
      ]) {
        const sample = visible[key];
        const before = await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .rangeRequests.length,
        );

        const handled = await page.evaluate(
          async (point) =>
            globalThis.__FOLLOW_TEST__
              .handlePoint(point),
          sample.point,
        );
        assert.equal(
          handled,
          true,
          `${key} point must request one bounded replay`,
        );

        const request = await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .rangeRequests.at(-1),
        );
        const measureIndex =
          sample.measure.target.measureIndex;
        assert.deepEqual(request, {
          startBeat: measureIndex * 4,
          endBeat: measureIndex * 4 + 4,
        });

        const after = await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .rangeRequests.length,
        );
        assert.equal(after, before + 1);
      }

      const outsideBefore = await page.evaluate(
        () =>
          globalThis.__FOLLOW_TEST__
            .rangeRequests.length,
      );
      assert.equal(
        await page.evaluate(
          async (point) =>
            globalThis.__FOLLOW_TEST__
              .handlePoint(point),
          visible.outside.point,
        ),
        false,
      );
      assert.equal(
        await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .rangeRequests.length,
        ),
        outsideBefore,
      );

      let later = visible.later;
      for (
        let attempt = 0;
        later === null && attempt < 12;
        attempt += 1
      ) {
        await page.evaluate(() => {
          window.scrollBy(
            0,
            Math.max(
              160,
              Math.floor(window.innerHeight * 0.7),
            ),
          );
        });
        await page.waitForTimeout(30);
        visible = await scanVisible(page, {
          requireLaterMeasure: true,
        });
        later = visible.later;
      }

      assert.notEqual(
        later,
        null,
        "a later measure must be discoverable after scrolling",
      );

      const laterHandled = await page.evaluate(
        async (point) =>
          globalThis.__FOLLOW_TEST__
            .handlePoint(point),
        later.point,
      );
      assert.equal(laterHandled, true);
      const laterRequest = await page.evaluate(
        () =>
          globalThis.__FOLLOW_TEST__
            .rangeRequests.at(-1),
      );
      const laterIndex =
        later.measure.target.measureIndex;
      assert.deepEqual(laterRequest, {
        startBeat: laterIndex * 4,
        endBeat: laterIndex * 4 + 4,
      });

      await page.evaluate(() =>
        window.scrollTo(0, 0),
      );
      await page.waitForTimeout(30);

      await page.evaluate(async () => {
        await globalThis.__FOLLOW_TEST__
          .emitPosition({
            generation: 1,
            beat: 0,
            playing: true,
          });
      });

      assert.deepEqual(
        await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .cursorTargets.at(-1),
        ),
        { partId: "P1", measureIndex: 0 },
      );
      assert.equal(
        await page.locator(
          '#st-score-root [data-st-score-highlight="true"]',
        ).count(),
        2,
        "the opening chord must expose two exact highlighted noteheads",
      );

      await page.evaluate(async () => {
        await globalThis.__FOLLOW_TEST__
          .emitPosition({
            generation: 1,
            beat: 1,
            playing: true,
          });
      });
      assert.equal(
        await page.locator(
          '#st-score-root [data-st-score-highlight="true"]',
        ).count(),
        0,
        "a rest beat must clear note highlight",
      );

      await page.evaluate(async () => {
        await globalThis.__FOLLOW_TEST__
          .emitPosition({
            generation: 1,
            beat: 4,
            playing: true,
          });
      });
      assert.deepEqual(
        await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .cursorTargets.at(-1),
        ),
        { partId: "P1", measureIndex: 1 },
        "position observation must advance the measure cursor",
      );

      await page.evaluate(async () => {
        await globalThis.__FOLLOW_TEST__
          .useUnavailableEventProvenance();
        await globalThis.__FOLLOW_TEST__
          .emitPosition({
            generation: 2,
            beat: 0,
            playing: true,
          });
      });

      assert.deepEqual(
        await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .cursorTargets.at(-1),
        ),
        { partId: "P1", measureIndex: 0 },
        "unsupported event provenance must still move the measure cursor",
      );
      assert.equal(
        await page.locator(
          '#st-score-root [data-st-score-highlight="true"]',
        ).count(),
        0,
        "unsupported event provenance must not highlight notes",
      );
      assert.deepEqual(
        await page.evaluate(
          () =>
            globalThis.__FOLLOW_TEST__
              .highlightTargets,
        ),
        [],
      );

      const replayAfterNoProvenance =
        await page.evaluate(async (point) => {
          const before =
            globalThis.__FOLLOW_TEST__
              .rangeRequests.length;
          const handled =
            await globalThis.__FOLLOW_TEST__
              .handlePoint(point);
          return {
            handled,
            before,
            after:
              globalThis.__FOLLOW_TEST__
                .rangeRequests.length,
          };
        }, (await scanVisible(page)).note.point);
      assert.deepEqual(
        replayAfterNoProvenance,
        {
          handled: true,
          before:
            replayAfterNoProvenance.before,
          after:
            replayAfterNoProvenance.before + 1,
        },
      );

      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);

test(
  "service worker v17 serves score-follow modules while offline",
  { timeout: 90_000 },
  async () => {
    const browser = await browserType().launch({
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
    });
    const page = await context.newPage();
    let offlineServer = null;

    try {
      offlineServer =
        await startRepositoryStaticServer({
          htmlRoutes: Object.freeze({
            "/": "<!doctype html><html><body>Student shell offline fixture</body></html>",
          }),
        });

      const response = await page.goto(
        `${offlineServer.baseUrl}/vendor/st-score-runtime/index.html`,
      );
      assert.equal(response?.status(), 200);

      const registration = await page.evaluate(
        async () => {
          const registered =
            await navigator.serviceWorker.register(
              "/service-worker.js",
              { scope: "/" },
            );
          await navigator.serviceWorker.ready;

          if (
            registered.installing !== null ||
            registered.waiting !== null
          ) {
            await new Promise((resolve) => {
              const worker =
                registered.installing ??
                registered.waiting;
              if (
                worker === null ||
                worker.state === "activated"
              ) {
                resolve();
                return;
              }
              worker.addEventListener(
                "statechange",
                () => {
                  if (
                    worker.state === "activated"
                  ) {
                    resolve();
                  }
                },
              );
            });
          }

          return {
            names: await caches.keys(),
            controlled:
              navigator.serviceWorker.controller !==
              null,
          };
        },
      );

      assert.ok(
        registration.names.includes(
          "st-student-shell-v17",
        ),
        "v17 shell cache must exist",
      );

      if (!registration.controlled) {
        await page.reload();
      }

      await page.waitForFunction(
        () =>
          navigator.serviceWorker.controller !==
          null,
      );

      const offlinePrerequisites =
        await page.evaluate(async () => ({
          controlled:
            navigator.serviceWorker.controller !==
            null,
          controllerScript:
            navigator.serviceWorker.controller
              ?.scriptURL ?? null,
          coordinatorCached:
            (await caches.match(
              "/src/practice/scoreFollowCoordinator.js",
            )) !== undefined,
          indexCached:
            (await caches.match(
              "/src/practice/scoreFollowIndex.js",
            )) !== undefined,
        }));

      assert.deepEqual(
        offlinePrerequisites,
        {
          controlled: true,
          controllerScript:
            new URL(
              "/service-worker.js",
              offlineServer.baseUrl,
            ).href,
          coordinatorCached: true,
          indexCached: true,
        },
        "offline follow prerequisites must be controlled and cached before disconnect",
      );

      offlineServer.blockPaths([
        "/src/practice/scoreFollowCoordinator.js",
        "/src/practice/scoreFollowIndex.js",
        "/src/playback/musicXmlPlaybackDom.js",
      ]);

      const offlineResult = await page.evaluate(
        async () => {
          async function safeFetch(url) {
            try {
              const response = await fetch(url);
              return {
                ok: true,
                status: response.status,
              };
            } catch (error) {
              return {
                ok: false,
                status: null,
                error:
                  error instanceof Error
                    ? error.message
                    : String(error),
              };
            }
          }

          const coordinator =
            await safeFetch(
              "/src/practice/scoreFollowCoordinator.js",
            );
          const index =
            await safeFetch(
              "/src/practice/scoreFollowIndex.js",
            );

          let imported = false;
          let importError = null;
          try {
            const module =
              await import(
                "/src/practice/scoreFollowCoordinator.js"
              );
            imported =
              typeof module
                .createScoreFollowCoordinator ===
              "function";
          } catch (error) {
            importError =
              error instanceof Error
                ? error.message
                : String(error);
          }

          return {
            coordinator,
            index,
            imported,
            importError,
          };
        },
      );

      const blockedRequests =
        offlineServer.getBlockedRequests();

      assert.deepEqual(
        blockedRequests,
        [],
        `follow graph reached blocked origin paths: ${JSON.stringify({
          offlineResult,
          blockedRequests,
        })}`,
      );

      assert.deepEqual(offlineResult, {
        coordinator: {
          ok: true,
          status: 200,
        },
        index: {
          ok: true,
          status: 200,
        },
        imported: true,
        importError: null,
      });
    } finally {
      await offlineServer?.close().catch(
        () => {},
      );
      await context.close();
      await browser.close();
    }
  },
);
