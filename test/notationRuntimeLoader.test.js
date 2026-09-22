import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTATION_RUNTIME_STATES,
  createNotationRuntimeLoader,
} from "../src/practice/notationRuntimeLoader.js";

const BOOTSTRAP_URL = "./vendor/st-score-runtime/browser-bootstrap.mjs";
const VENDOR_URL = "./vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js";

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

function makeScriptNode() {
  const listeners = new Map();
  return {
    type: "",
    src: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    emit(type, value) {
      listeners.get(type)?.(value);
    },
  };
}

test("missing local runtime configuration is unavailable", async () => {
  const loader = createNotationRuntimeLoader({
    getRuntime: () => undefined,
    documentObject: {},
    windowObject: makeWindow(),
    bootstrapUrl: null,
    vendorUrl: null,
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

test("trusted local runtime loads vendor before bootstrap then waits for renderer ready event", async () => {
  let runtime;
  let vendorRuntime;
  const windowObject = makeWindow();
  const appended = [];
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement(tag) {
      assert.equal(tag, "script");
      return makeScriptNode();
    },
    head: {
      append(node) {
        appended.push(node);
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    getVendorRuntime: () => vendorRuntime,
    documentObject,
    windowObject,
    bootstrapUrl: BOOTSTRAP_URL,
    vendorUrl: VENDOR_URL,
  });

  const resultPromise = loader.ensureReady();

  assert.equal(loader.isInstallable(), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, VENDOR_URL);
  assert.notEqual(appended[0].type, "module");

  vendorRuntime = function OpenSheetMusicDisplay() {};
  appended[0].emit("load");

  await Promise.resolve();
  assert.equal(appended.length, 2);
  assert.equal(appended[1].src, BOOTSTRAP_URL);
  assert.equal(appended[1].type, "module");

  runtime = compatibleRuntime();
  windowObject.dispatch("st-score-render-host-ready", { contractVersion: "0.2.0" });

  assert.deepEqual(await resultPromise, {
    state: NOTATION_RUNTIME_STATES.READY,
  });
});

test("ready event contract mismatch fails closed", async () => {
  let runtime;
  let vendorRuntime;
  const windowObject = makeWindow();
  const appended = [];
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement() {
      return makeScriptNode();
    },
    head: {
      append(node) {
        appended.push(node);
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    getVendorRuntime: () => vendorRuntime,
    documentObject,
    windowObject,
    bootstrapUrl: BOOTSTRAP_URL,
    vendorUrl: VENDOR_URL,
  });

  const resultPromise = loader.ensureReady();
  vendorRuntime = function OpenSheetMusicDisplay() {};
  appended[0].emit("load");
  await Promise.resolve();

  runtime = compatibleRuntime();
  windowObject.dispatch("st-score-render-host-ready", { contractVersion: "9.9.9" });

  assert.deepEqual(await resultPromise, {
    state: NOTATION_RUNTIME_STATES.ERROR,
  });
});

test("vendor load failure becomes bounded ERROR", async () => {
  const windowObject = makeWindow();
  const appended = [];
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement() {
      return makeScriptNode();
    },
    head: {
      append(node) {
        appended.push(node);
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => undefined,
    getVendorRuntime: () => undefined,
    documentObject,
    windowObject,
    bootstrapUrl: BOOTSTRAP_URL,
    vendorUrl: VENDOR_URL,
  });

  const resultPromise = loader.ensureReady();
  appended[0].emit("error", new Error("private browser detail"));
  const result = await resultPromise;

  assert.deepEqual(result, { state: NOTATION_RUNTIME_STATES.ERROR });
  assert.equal(JSON.stringify(result).includes("private browser detail"), false);
});

test("concurrent ensureReady calls share one vendor and one bootstrap installation", async () => {
  let runtime;
  let vendorRuntime;
  const windowObject = makeWindow();
  const appended = [];
  const documentObject = {
    baseURI: "https://student.example/app/",
    createElement() {
      return makeScriptNode();
    },
    head: {
      append(node) {
        appended.push(node);
      },
    },
  };
  const loader = createNotationRuntimeLoader({
    getRuntime: () => runtime,
    getVendorRuntime: () => vendorRuntime,
    documentObject,
    windowObject,
    bootstrapUrl: BOOTSTRAP_URL,
    vendorUrl: VENDOR_URL,
  });

  const first = loader.ensureReady();
  const second = loader.ensureReady();

  assert.equal(appended.length, 1);
  vendorRuntime = function OpenSheetMusicDisplay() {};
  appended[0].emit("load");
  await Promise.resolve();

  assert.equal(appended.length, 2);
  runtime = compatibleRuntime();
  windowObject.dispatch("st-score-render-host-ready", { contractVersion: "0.2.0" });

  assert.deepEqual(await first, { state: NOTATION_RUNTIME_STATES.READY });
  assert.deepEqual(await second, { state: NOTATION_RUNTIME_STATES.READY });
  assert.deepEqual(appended.map((node) => node.src), [VENDOR_URL, BOOTSTRAP_URL]);
});
