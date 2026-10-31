import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";

import {
  createViolinFingerboardPresentation,
} from "../src/ui/violinFingerboard.js";

function available(overrides = {}) {
  return Object.freeze({
    state: "AVAILABLE",
    eventId: "P1:0:1:0",
    playing: true,
    pitch: Object.freeze({ step: "F", alter: 1, octave: 4 }),
    position: 1,
    primary: Object.freeze({
      stringId: "D",
      finger: 2,
      placement: "HIGH",
      normalizedPosition: 0.206299,
      distanceFromNutMm: 67.666,
    }),
    alternatives: Object.freeze([]),
    ...overrides,
  });
}

function fakeRoot() {
  const panel = { innerHTML: "" };
  return {
    panel,
    querySelector(selector) {
      return selector === "[data-violin-fingerboard]" ? panel : null;
    },
  };
}

test("available F#4 renders four strings and a D-string high-second marker at engine ratio", async () => {
  const root = fakeRoot();
  const presentation = createViolinFingerboardPresentation({ root });

  assert.equal(await presentation.show(available()), true);

  assert.match(root.panel.innerHTML, />G<\/text>/);
  assert.match(root.panel.innerHTML, />D<\/text>/);
  assert.match(root.panel.innerHTML, />A<\/text>/);
  assert.match(root.panel.innerHTML, />E<\/text>/);
  assert.match(root.panel.innerHTML, /data-active-string="D"/);
  assert.match(root.panel.innerHTML, /data-finger="2"/);
  assert.match(root.panel.innerHTML, /data-placement="HIGH"/);
  assert.match(root.panel.innerHTML, /data-stop-ratio="0\.206299"/);
  assert.match(root.panel.innerHTML, /class="violin-stop-number"[^>]*>2<\/text>/);
  assert.match(root.panel.innerHTML, /20\.6299%/);
  assert.doesNotMatch(root.panel.innerHTML, /25(?:\.0+)?%/);
  assert.match(root.panel.innerHTML, /Fa diyez/);
  assert.match(root.panel.innerHTML, /Re teli/);
  assert.match(root.panel.innerHTML, /İkinci parmak/);
  assert.match(root.panel.innerHTML, /Yüksek ikinci parmak/);
  assert.doesNotMatch(root.panel.innerHTML, /aria-live/);
});

test("open string presentation does not invent a stopped-finger dot", async () => {
  const root = fakeRoot();
  const presentation = createViolinFingerboardPresentation({ root });

  await presentation.show(
    available({
      pitch: Object.freeze({ step: "D", alter: 0, octave: 4 }),
      primary: Object.freeze({
        stringId: "D",
        finger: 0,
        placement: "OPEN",
        normalizedPosition: 0,
        distanceFromNutMm: 0,
      }),
    }),
  );

  assert.match(root.panel.innerHTML, /Açık Re teli/);
  assert.doesNotMatch(root.panel.innerHTML, /class="violin-stop-marker"/);
  assert.doesNotMatch(root.panel.innerHTML, /class="violin-stop-number"/);
});

test("unavailable or ambiguous snapshot clears active marker", async () => {
  const root = fakeRoot();
  const presentation = createViolinFingerboardPresentation({ root });

  await presentation.show(available());
  await presentation.show({ state: "AMBIGUOUS_EVENT" });

  assert.doesNotMatch(root.panel.innerHTML, /class="violin-stop-marker"/);
  assert.match(root.panel.innerHTML, /Çalma başladığında/);
});

test("clear resets fingerboard presentation without a live-region announcement", async () => {
  const root = fakeRoot();
  const presentation = createViolinFingerboardPresentation({ root });

  await presentation.show(available());
  assert.equal(await presentation.clear(), true);

  assert.match(root.panel.innerHTML, /Çalma başladığında/);
  assert.doesNotMatch(root.panel.innerHTML, /aria-live/);
});

test("fingerboard implementation is static presentation and uses responsive violin styles", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /\.violin-fingerboard-svg\s*\{[^}]*width:\s*100%/s);
  assert.match(html, /\.violin-stop-marker\s*\{/);
  assert.match(html, /\.violin-fingering-text\s*\{/);
});

test("material paints stay local to compact, hidden detail and separate presenters", () => {
  const allIds = [];
  for (let instance = 0; instance < 2; instance += 1) {
    const compact = { innerHTML: "" };
    const detail = { innerHTML: "" };
    const presentation = createViolinFingerboardPresentation({
      root: {
        querySelector(selector) {
          if (selector === "[data-violin-fingerboard]") return compact;
          if (selector === "[data-violin-detail-state]") return detail;
          return null;
        },
      },
    });
    presentation.show(available());
    let description;
    for (const panel of [compact, detail]) {
      const doc = new DOMParser().parseFromString(panel.innerHTML, "application/xml");
      const svg = doc.getElementsByTagName("svg")[0];
      const nodes = Array.from(svg.getElementsByTagName("*"));
      const ids = nodes.filter((node) => node.hasAttribute("id"))
        .map((node) => node.getAttribute("id"));
      const references = nodes.flatMap((node) => ["fill", "stroke", "clip-path"]
        .map((attribute) => node.getAttribute(attribute) ?? "")
        .filter((value) => value.startsWith("url(")));
      assert.ok(references.length > 0, "realistic materials reference local SVG paints");
      for (const reference of references) {
        const match = /^url\(#([A-Za-z0-9_-]+)\)$/.exec(reference);
        assert.ok(match, "material reference is a safe document fragment");
        assert.ok(ids.includes(match[1]), "each paint resolves inside its own SVG");
      }
      allIds.push(...ids);
      assert.equal(svg.getAttribute("viewBox"), "0 0 320 112");
      const marker = nodes.find((node) => node.getAttribute("class") === "violin-stop-marker");
      assert.ok(Math.abs(Number(marker.getAttribute("cx")) - 93.63774) < 1e-9);
      assert.equal(Number(marker.getAttribute("cy")), 44);
      description ??= svg.getAttribute("aria-label");
      assert.equal(svg.getAttribute("aria-label"), description);
    }
    presentation.clear();
    assert.doesNotMatch(compact.innerHTML + detail.innerHTML, /<svg/);
  }
  assert.equal(new Set(allIds).size, allIds.length, "no IDs are shared with hidden or other panels");
});
