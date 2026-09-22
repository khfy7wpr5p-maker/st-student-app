import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTATION_RUNTIME_STATES,
  createNotationRuntimeLoader,
} from "../src/practice/notationRuntimeLoader.js";

function makeDocument() {
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
      },
    },
  };
  return { documentObject, appended };
}

test("missing bootstrap configuration is unavailable", async () => {
  const { documentObject } = makeDocument();
  const loader = createNotationRuntimeLoader({
    getRuntime: () => undefined,
    documentObject,
    bootstrapUrl: null,
  });
  assert.equal(loader.isInstallable(), false);
  assert.equal(loader.isReady(), false);
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.UNAVAILABLE,
  });
});

test("compatible existing runtime is already ready", async () => {
  const runtime = {
    contractVersion: "0.2.0",
    async renderMusicXml() {},
    async dispose() {},
  };
  const loader = createNotationRuntimeLoader({ getRuntime: () => runtime });
  assert.equal(loader.isReady(), true);
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.READY,
  });
});

test("trusted local module installs and becomes ready", async () => {
  let runtime;
  const listeners = {};
  const appended = [];
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement() {
      return {
        type: "",
        src: "",
        addEventListener(type, listener) {
          listeners[type] = listener;
        },
      };
    },
    head: {
      append(node) {
        appended.push(node);
        runtime = {
          contractVersion: "0.2.0",
          async renderMusicXml() {},
          async dispose() {},
        };
        listeners.load();
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    documentObject,
    bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  });
  assert.equal(loader.isInstallable(), true);
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.READY,
  });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].type, "module");
});

test("contract mismatch fails closed", async () => {
  const runtime = {
    contractVersion: "9.9.9",
    async renderMusicXml() {},
    async dispose() {},
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
    documentObject: makeDocument().documentObject,
  });
  assert.equal(loader.isReady(), false);
  assert.deepEqual(await loader.ensureReady(), {
    state: NOTATION_RUNTIME_STATES.ERROR,
  });
});

test("script load failure becomes bounded ERROR", async () => {
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
        appendCount += 1;
        release = () => {
          runtime = {
            contractVersion: "0.2.0",
            async renderMusicXml() {},
            async dispose() {},
          };
          listeners.load();
        };
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    documentObject,
    bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  });
  const first = loader.ensureReady();
  const second = loader.ensureReady();
  assert.equal(appendCount, 1);
  release();
  assert.deepEqual(await first, { state: NOTATION_RUNTIME_STATES.READY });
  assert.deepEqual(await second, { state: NOTATION_RUNTIME_STATES.READY });
});
