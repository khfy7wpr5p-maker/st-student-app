import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
