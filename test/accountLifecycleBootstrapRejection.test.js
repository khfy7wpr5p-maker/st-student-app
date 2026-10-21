import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entryPath = fileURLToPath(new URL("../src/ui/main.js", import.meta.url));

// Use a separate Node process with strict rejection handling so a floating
// Promise is a real test failure, without installing global process listeners.
const fixture = `
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const [entryPath, operation, failurePoint, outcome] = process.argv.slice(1);
const source = await readFile(entryPath, "utf8");
const body = source.replace(/^import\\s[\\s\\S]*?from\\s+["'][^"']+["'];\\s*$/gm, "");
const empty = () => ({});
let session = { studentId: "student-a" };
let subscriber;
let mounted = false;
let attached = 0;
let renders = 0;
let stage = "initial";
let finishReadiness;
const readiness = new Promise(resolve => { finishReadiness = resolve; });
const flush = () => new Promise(resolve => setImmediate(resolve));
const selectedOutcome = () => outcome === "rejected"
  ? Promise.reject(new Error("private-bootstrap-provider-detail"))
  : new Promise(() => {});
const lifecycleCalls = [];
const controller = {
  getState: () => ({ session }),
  attachSession(next) { session = next; attached += 1; },
  signOut() { session = null; },
  async recoverActivePracticePlayback() {},
};
const context = {
  document: { createElement: empty, head: { append() {} }, querySelector: empty },
  createFirebaseBrowserRuntime: () => ({ authAdapter: {
    async restoreSession() { return session; },
    subscribe(callback) { subscriber = callback; },
  } }),
  runInviteActivationIfPresent: async () => false,
  createNotationRuntimeLoader: empty,
  createStNotationAdapter: empty,
  createPlaybackPlanResolver: empty,
  createPianoSampleBank: () => ({ initialize: () => readiness }),
  createScoreAudioVoiceAdapter: empty,
  createWebAudioPianoEngine: empty,
  createStudentPlaybackPort: empty,
  createScoreFollowCoordinator: empty,
  createViolinFingerboardPresentation: empty,
  createViolinFollowCoordinator: empty,
  createAccountServiceConfig: () => ({ enabled: false }),
  createAccountLifecycleCoordinator: () => ({
    handleSession(next) {
      if (next === null) return Promise.resolve();
      lifecycleCalls.push(next.studentId);
      const selected = failurePoint === "initial"
        ? lifecycleCalls.length === 1 : lifecycleCalls.length === 2;
      return operation === "lifecycle" && selected
        ? selectedOutcome() : Promise.resolve();
    },
    dispose() {},
  }),
  createDefaultOfflineInfrastructure: empty,
  createSecureDeliveryConfig: () => ({ enabled: false }),
  createStudent08Composition: empty,
  createStudentPerfASharingService: empty,
  createStudentPerfAReadService: empty,
  createStudentAppController: () => controller,
  createStudentPerfAController: ({ controller }) => controller,
  mountStudentApp() {
    mounted = true;
    return { render() {
      renders += 1;
      return operation === "render" && stage === failurePoint
        ? selectedOutcome() : Promise.resolve();
    } };
  },
  registerStudentAppServiceWorker: async () => {},
};
await vm.runInNewContext("(async () => {" + body + "\\n})()", context);
assert.equal(mounted, true, "lifecycle must not delay mounting the shell");
const readinessRender = operation === "render" && failurePoint === "readiness" ? 1 : 0;
if (readinessRender) {
  stage = "readiness";
  finishReadiness(true);
  await flush();
  assert.equal(renders, 1, "audio readiness must request a render");
}
stage = "auth-change";
subscriber({ studentId: "student-b" });
assert.equal(attached, 1, "lifecycle must not delay attaching the new session");
assert.equal(renders, readinessRender + 1);
assert.deepEqual(lifecycleCalls, ["student-a", "student-b"]);
stage = "sign-out";
subscriber(null);
assert.equal(controller.getState().session, null, "sign-out must remain synchronous");
assert.equal(renders, readinessRender + 2);
await flush();
await flush();
`;

for (const [operation, failurePoint] of [
  ["lifecycle", "initial"],
  ["lifecycle", "auth-change"],
  ["render", "readiness"],
  ["render", "auth-change"],
  ["render", "sign-out"],
]) {
  for (const outcome of ["rejected", "pending"]) {
    test(`${operation} ${outcome} at ${failurePoint} preserves bootstrap and auth transitions`, () => {
      const result = spawnSync(process.execPath, [
        "--unhandled-rejections=strict", "--input-type=module", "--eval",
        fixture, entryPath, operation, failurePoint, outcome,
      ], { encoding: "utf8", timeout: 5000 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout + result.stderr, /private-bootstrap-provider-detail/);
    });
  }
}
