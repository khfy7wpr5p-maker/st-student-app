import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTATION_RUNTIME_STATES,
  createNotationRuntimeLoader,
} from "../src/practice/notationRuntimeLoader.js";

function compatibleRuntime() {
  return {
    async renderMusicXml() {},
    async dispose() {},
  };
}

function makeWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, detail) {
      listeners.get(type)?.({ detail });
    },
  };
}

test("missing bootstrap configuration is unavailable", async () => {
  const loader = createNotationRuntimeLoader({
    getRuntime: () => undefined,
    documentObject: {},
    windowObject: makeWindow(),
    bootstrapUrl: null,
  });
  assert.equal(loader.isInstallable(), false);
  assert.equal(loader.isReady(), false);
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.UNAVAILABLE,
  });
});

test("compatible existing runtime is already ready", async () => {
  const runtime = compatibleRuntime();
  const loader = createNotationRuntimeLoader({ getRuntime: () => runtime });
  assert.equal(loader.isReady(), true);
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.READY,
  });
});

test("trusted local module installs after renderer ready event", async () => {
  let runtime;
  const windowObject = makeWindow();
  const appended = [];
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement(tag) {
      assert.equal(tag, "script");
      return { type: "", src: "", addEventListener() {} };
    },
    head: {
      append(node) {
        appended.push(node);
        runtime = compatibleRuntime();
        windowObject.dispatch("st-score-render-host-ready", { contractVersion: "0.2.0" });
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    documentObject,
    windowObject,
    bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  });
  assert.equal(loader.isInstallable(), true);
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.READY,
  });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].type, "module");
});

test("ready event contract mismatch fails closed", async () => {
  let runtime;
  const windowObject = makeWindow();
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement() {
      return { addEventListener() {} };
    },
    head: {
      append() {
        runtime = compatibleRuntime();
        windowObject.dispatch("st-score-render-host-ready", { contractVersion: "9.9.9" });
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    documentObject,
    windowObject,
    bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  });
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.ERROR,
  });
});

test("script load failure becomes bounded ERROR", async () => {
  const windowObject = makeWindow();
  const listeners = {};
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement() {
      return {
        addEventListener(type, listener) {
          listeners[type] = listener;
        },
      };
    },
    head: {
      append() {
        listeners.error(new Error("private browser detail"));
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => undefined,
    documentObject,
    windowObject,
    bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  });
  const result = await loader.ensureReady();
  assert.deepEqual(result, { state: NOTATION_RUNTIME_STATES.ERROR });
  assert.equal(JSON.stringify(result).includes("private browser detail"), false);
});

test("concurrent ensureReady calls share one installation", async () => {
  let runtime;
  let release;
  let appendCount = 0;
  const windowObject = makeWindow();
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement() {
      return { addEventListener() {} };
    },
    head: {
      append() {
        appendCount += 1;
        release = () => {
          runtime = compatibleRuntime();
          windowObject.dispatch("st-score-render-host-ready", { contractVersion: "0.2.0" });
        };
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    documentObject,
    windowObject,
    bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  });
  const first = loader.ensureReady();
  const second = loader.ensureReady();
  assert.equal(appendCount, 1);
  release();
  assert.deepEqual(await first, { state: NOTATION_RUNTIME_STATES.READY });
  assert.deepEqual(await second, { state: NOTATION_RUNTIME_STATES.READY });
});
