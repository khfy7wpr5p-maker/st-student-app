import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const moduleUrl = new URL("../src/ui/mountStudentApp.js", import.meta.url).href;

// Strict child processes detect unhandled rejections without changing the
// parent test runner's global rejection listeners.
const fixture = `
import assert from "node:assert/strict";
const [moduleUrl, scenario] = process.argv.slice(1);
const { mountStudentApp } = await import(moduleUrl);
const flush = () => new Promise(resolve => setImmediate(resolve));
let subscriber;
let injectFailure = scenario === "initial";
let failNextRead = false;
let failureObserved = false;
let syncCalls = 0;
let recoveryCalls = 0;
let disposalCalls = 0;
const listeners = new Map();
const root = {
  innerHTML: "",
  addEventListener(type, listener) { listeners.set(type, listener); },
  removeEventListener(type) { listeners.delete(type); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const mounted = mountStudentApp({
  root,
  controller: {
    getState() {
      if (failNextRead) {
        failNextRead = false;
        injectFailure = false;
        failureObserved = true;
        throw new Error("private-render-provider-detail");
      }
      // The state provider fails after the synchronous shell paint, while
      // the asynchronous render lifecycle is still running.
      if (injectFailure) queueMicrotask(() => { failNextRead = true; });
      return { screen: "sign_in", session: null, items: [], practice: null };
    },
    async synchronizeOffline() { syncCalls += 1; },
    async recoverActivePracticePlayback() { recoveryCalls += 1; },
  },
  scoreFollowCoordinator: {
    async dispose() { disposalCalls += 1; },
  },
  connectivityPort: {
    getState: () => "OFFLINE",
    subscribe(listener) {
      subscriber = listener;
      return () => { subscriber = null; };
    },
  },
});
assert.equal(typeof mounted.render, "function", "mount must remain synchronous");
assert.equal(listeners.size, 3);
assert.ok(root.innerHTML.length > 0, "shell must be painted immediately");
await flush();
if (scenario === "connectivity") {
  injectFailure = true;
  subscriber("ONLINE");
  await flush();
  assert.equal(syncCalls, 1);
  assert.equal(recoveryCalls, 1);
}
await flush();
assert.equal(failureObserved, true, "the render failure must actually occur");
assert.equal(listeners.size, 3, "render failure must preserve shell controls");
assert.doesNotMatch(root.innerHTML, /private-render-provider-detail/);
await mounted.render();
injectFailure = true;
await assert.rejects(mounted.render(), /private-render-provider-detail/,
  "explicit render callers must still receive the failure");
await mounted.destroy();
assert.equal(disposalCalls, 1, "render failure must not skip asynchronous disposal");
assert.equal(subscriber, null);
assert.equal(listeners.size, 0);
`;

for (const scenario of ["initial", "connectivity"]) {
  test(`${scenario} render rejection stays handled without blocking the shell`, () => {
    const result = spawnSync(process.execPath, [
      "--unhandled-rejections=strict", "--input-type=module", "--eval",
      fixture, moduleUrl, scenario,
    ], { encoding: "utf8", timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /private-render-provider-detail/);
  });
}
