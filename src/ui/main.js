import { createSecureDeliveryConfig } from "../config/secureDeliveryConfig.js";
import { createDefaultOfflineInfrastructure } from "../offline/defaultOfflineInfrastructure.js";
import { createForegroundSyncCoordinator } from "../offline/syncCoordinator.js";
import { registerStudentAppServiceWorker } from "../offline/serviceWorkerRegistration.js";
import { createStNotationAdapter } from "../practice/notationAdapter.js";
import { createNotationRuntimeLoader } from "../practice/notationRuntimeLoader.js";
import { createPlaybackPlanResolver } from "../playback/playbackPlanResolver.js";
import { createPianoSampleBank } from "../playback/pianoSampleBank.js";
import { createWebAudioPianoEngine } from "../playback/webAudioPianoEngine.js";
import { createStudentPlaybackPort } from "../playback/studentPlaybackPort.js";
import { createFirebaseBrowserRuntime } from "../providers/firebase/firebaseBrowserRuntime.js";
import { createStudentAppController } from "./studentAppController.js";
import { createStudent08Composition } from "./student08Composition.js";
import { mountStudentApp } from "./mountStudentApp.js";

const root = document.querySelector("#app");
const notationRuntimeLoader = createNotationRuntimeLoader({
  bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  vendorUrl: "./vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js",
});
const notationAdapter = createStNotationAdapter({ runtimeLoader: notationRuntimeLoader });
const playbackPlanResolver = createPlaybackPlanResolver();
const sampleBank = createPianoSampleBank({
  manifestUrl: "./vendor/st-piano/runtime-manifest.json",
});

await sampleBank.initialize().catch(() => false);

const audioContextSupported =
  typeof (globalThis.AudioContext ?? globalThis.webkitAudioContext) === "function";

const audioContextFactory = () => {
  const AudioContextCtor =
    globalThis.AudioContext ?? globalThis.webkitAudioContext;

  return typeof AudioContextCtor === "function"
    ? new AudioContextCtor()
    : null;
};

const playbackEngine = createWebAudioPianoEngine({
  audioContextFactory,
  audioContextSupported,
  sampleBank,
});
const playbackPort = createStudentPlaybackPort({
  playbackPlanResolver,
  engine: playbackEngine,
});
const firebaseRuntime = createFirebaseBrowserRuntime();

let initialSession = null;

try {
  initialSession = await firebaseRuntime.authAdapter.restoreSession();
} catch {
  initialSession = null;
}

const offlineInfrastructure = createDefaultOfflineInfrastructure({
  onlineSharingService: firebaseRuntime.sharingService,
});

const secureDeliveryConfig =
  createSecureDeliveryConfig();

const student08Composition =
  createStudent08Composition({
    config: secureDeliveryConfig,
    authAdapter: firebaseRuntime.authAdapter,
    fetchImpl: globalThis.fetch,
    connectivityPort:
      offlineInfrastructure.connectivityPort,
    offlineRepository:
      offlineInfrastructure.offlineRepository,
  });

const syncCoordinator =
  secureDeliveryConfig.enabled &&
  offlineInfrastructure.offlineRepository !== null
    ? createForegroundSyncCoordinator({
        offlineRepository:
          offlineInfrastructure.offlineRepository,
        publicationStatusService:
          firebaseRuntime.sharingService,
        secureDeliveryStatusService:
          student08Composition.secureDeliveryStatusService,
      })
    : null;

const controller = createStudentAppController({
  sharingService: offlineInfrastructure.sharingService,
  student08ReadService:
    student08Composition.student08ReadService,
  initialSession,
  notationAdapter,
  playbackPort,
  syncCoordinator,
});

const mounted = mountStudentApp({
  root,
  controller,
  notationAdapter,
  connectivityPort: offlineInfrastructure.connectivityPort,
  requestSignIn(credentials) {
    return firebaseRuntime.authAdapter.signIn(credentials);
  },
  requestSignOut() {
    return firebaseRuntime.authAdapter.signOut();
  },
});

firebaseRuntime.authAdapter.subscribe((session) => {
  const currentSession = controller.getState().session;

  if (session === null) {
    if (currentSession !== null) {
      controller.signOut();
      mounted.render();
    }
    return;
  }

  if (currentSession?.studentId !== session.studentId) {
    controller.attachSession(session);
    mounted.render();
  }
});

registerStudentAppServiceWorker().catch(() => {});
