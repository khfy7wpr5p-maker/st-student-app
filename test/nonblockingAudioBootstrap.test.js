import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createPianoSampleBank } from "../src/playback/pianoSampleBank.js";
import { createWebAudioPianoEngine } from "../src/playback/webAudioPianoEngine.js";
import { createStudentAppController } from "../src/ui/studentAppController.js";
import { createStudentSession } from "../src/auth/session.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const outcome of ["ready", "failed"]) {
  test(`shell mounts before pending audio manifest settles (${outcome})`, async () => {
    const source = await readFile(new URL("../src/ui/main.js", import.meta.url), "utf8");
    const manifest = JSON.parse(await readFile(new URL("../vendor/st-piano/runtime-manifest.json", import.meta.url), "utf8"));
    let finishFetch;
    const pendingFetch = new Promise((resolve, reject) => { finishFetch = { resolve, reject }; });
    let fetches = 0;
    let mounted = false;
    let recoveries = 0;
    let renders = 0;
    let controller;
    const session = createStudentSession({ studentId: "student-a" });
    const pkg = {
      schemaVersion: "1.0.0", packageId: "pkg-a", workId: "work-a", title: "Practice",
      approvedRevision: { revisionId: "R1", state: "teacher_approved", approvedAt: "2026-10-19T12:00:00Z" },
      publication: { scope: "public_pool" },
      content: { score: { format: "musicxml", data: "<score-partwise/>" }, canonicalEvents: [] },
      practice: { tempoBpm: 80, allowTempoChange: true, allowMeasureRepeat: true, ttsLanguage: "tr-TR" },
    };
    let bank;
    let engine;
    const empty = () => ({});
    const context = {
      document: { createElement: empty, head: { append() {} }, querySelector: empty },
      AudioContext: function () { throw new Error("bootstrap must not create audio context"); },
      createFirebaseBrowserRuntime: () => ({ authAdapter: { async restoreSession() { return session; }, subscribe() {} } }),
      runInviteActivationIfPresent: async () => false,
      createNotationRuntimeLoader: empty, createStNotationAdapter: empty,
      createPlaybackPlanResolver: empty,
      createPianoSampleBank(options) {
        bank = createPianoSampleBank({ ...options, fetchImpl() { fetches += 1; return pendingFetch; } });
        return bank;
      },
      createScoreAudioVoiceAdapter: empty,
      createWebAudioPianoEngine(options) { engine = createWebAudioPianoEngine(options); return engine; },
      createStudentPlaybackPort: () => ({
        canPlayPackage: () => engine.isSupported(),
        async preparePackage() { recoveries += 1; return engine.prepare(); },
        playPackage() {}, pausePackage() {}, restartPackage() {},
        canChangeTempoForPackage: () => engine.isSupported(),
        canRepeatMeasureForPackage: () => engine.isSupported(),
        getPlaybackQualityForPackage: () => "APPROXIMATE",
        getReferenceTempoForPackage: () => 80,
        setTempoForPackage() {}, setMeasureRepeatEnabledForPackage() {},
      }), createScoreFollowCoordinator: empty,
      createViolinFingerboardPresentation: empty, createViolinFollowCoordinator: empty,
      createAccountServiceConfig: () => ({ enabled: false }),
      createAccountLifecycleCoordinator: () => ({ async handleSession() {}, dispose() {} }),
      createDefaultOfflineInfrastructure: empty,
      createSecureDeliveryConfig: () => ({ enabled: false }),
      createStudent08Composition: empty,
      createStudentPerfASharingService: () => ({ getPracticeItem() {
        return { publication: { publicationId: "pub-a", packageId: pkg.packageId, scope: "public_pool" }, package: pkg };
      } }), createStudentPerfAReadService: () => null,
      createStudentAppController(options) { controller = createStudentAppController(options); return controller; },
      createStudentPerfAController: ({ controller }) => controller,
      mountStudentApp() {
        mounted = true;
        controller.openPractice("pub-a");
        return { async render() { renders += 1; } };
      },
      registerStudentAppServiceWorker: async () => {},
    };
    // Execute the production entry body; replace only its imported boundaries,
    // including browser Firebase imports which cannot run in Node.
    const body = source.replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, "");
    const bootstrap = vm.runInNewContext(`(async () => { ${body}\n })()`, context);
    bootstrap.catch(() => {});
    try {
      await flush();
      assert.equal(fetches, 1);
      assert.equal(mounted, true, "login shell must mount while audio manifest is pending");
      assert.equal(engine.isSupported(), false, "unready legacy piano stays unavailable");
      assert.equal(controller.getState().practice.capabilities.playback, "UNAVAILABLE");
      const preparation = bank.initialize();
      assert.equal(fetches, 1, "playback preparation reuses pending initialization");
      if (outcome === "ready") finishFetch.resolve({ ok: true, json: async () => manifest });
      else finishFetch.reject(new Error("manifest unavailable"));
      assert.equal(await preparation, outcome === "ready");
      await bootstrap;
      assert.equal(engine.isSupported(), outcome === "ready");
      await flush();
      assert.equal(mounted, true);
      assert.equal(recoveries, outcome === "ready" ? 1 : 0, "manifest completion must notify active practice recovery");
      assert.equal(renders, outcome === "ready" ? 1 : 0, "recovered capabilities must be painted");
      assert.equal(controller.getState().practice.capabilities.playback, outcome === "ready" ? "AVAILABLE" : "UNAVAILABLE");
      assert.equal(controller.getState().practice.capabilities.tempoChange, outcome === "ready" ? "AVAILABLE" : "UNAVAILABLE");
    } finally {
      finishFetch.resolve({ ok: true, json: async () => manifest });
      await bootstrap;
    }
  });
}
