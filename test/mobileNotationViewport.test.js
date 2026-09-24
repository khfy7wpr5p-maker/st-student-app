import test from "node:test";
import assert from "node:assert/strict";

import { fitNotationViewport } from "../src/practice/notationViewport.js";

function fakeGraphic(tagName, box) {
  return {
    tagName,
    getBBox() {
      return { ...box };
    },
  };
}

function fakeSvg({
  viewBox = "0 0 1000 800",
  children = [],
} = {}) {
  const attributes = new Map([["viewBox", viewBox]]);
  const style = {};

  return {
    tagName: "svg",
    children,
    style,
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    snapshot() {
      return {
        viewBox: attributes.get("viewBox"),
        preserveAspectRatio: attributes.get("preserveAspectRatio"),
        width: attributes.get("width"),
        height: attributes.get("height"),
        style: { ...style },
      };
    },
  };
}

test("notation viewport removes empty page margins while capping mobile zoom", () => {
  const svg = fakeSvg({
    children: [
      fakeGraphic("rect", { x: 0, y: 0, width: 1000, height: 800 }),
      fakeGraphic("g", { x: 250, y: 220, width: 500, height: 120 }),
    ],
  });
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, "svg");
      return [svg];
    },
  };

  const result = fitNotationViewport(root, { viewportWidth: 390 });
  assert.equal(result.fitted, 1);

  const snapshot = svg.snapshot();
  const parts = snapshot.viewBox.split(/\s+/).map(Number);
  assert.equal(parts.length, 4);
  const [, , width, height] = parts;

  assert.ok(width >= 780 && width < 1000, String(width));
  assert.ok(height < 220, String(height));
  assert.equal(snapshot.preserveAspectRatio, "xMidYMin meet");
  assert.equal(snapshot.width, undefined);
  assert.equal(snapshot.height, undefined);
  assert.equal(snapshot.style.width, "100%");
  assert.equal(snapshot.style.height, "auto");
  assert.equal(snapshot.style.display, "block");
});

test("notation viewport keeps dense full-width scores at their natural scale", () => {
  const svg = fakeSvg({
    children: [
      fakeGraphic("g", { x: 20, y: 40, width: 960, height: 650 }),
    ],
  });
  const root = {
    querySelectorAll() {
      return [svg];
    },
  };

  fitNotationViewport(root, { viewportWidth: 390 });
  const [, , width] = svg
    .snapshot()
    .viewBox.split(/\s+/)
    .map(Number);

  assert.ok(width >= 990, String(width));
});

test("notation viewport fails closed when rendered SVG geometry is unavailable", () => {
  const svg = fakeSvg({
    children: [
      {
        tagName: "g",
        getBBox() {
          throw new Error("geometry unavailable");
        },
      },
    ],
  });
  const root = {
    querySelectorAll() {
      return [svg];
    },
  };

  assert.doesNotThrow(() =>
    fitNotationViewport(root, { viewportWidth: 390 }),
  );
  assert.equal(svg.snapshot().viewBox, "0 0 1000 800");
});


test("notation viewport leaves desktop rendering untouched", () => {
  const svg = fakeSvg({
    children: [
      fakeGraphic("g", { x: 250, y: 220, width: 500, height: 120 }),
    ],
  });
  const root = {
    querySelectorAll() {
      return [svg];
    },
  };

  const result = fitNotationViewport(root, { viewportWidth: 1024 });
  assert.deepEqual(result, { fitted: 0 });
  assert.equal(svg.snapshot().viewBox, "0 0 1000 800");
});
