import { createSecureDeliveryConfig } from "../config/secureDeliveryConfig.js";
import { createDefaultOfflineInfrastructure } from "../offline/defaultOfflineInfrastructure.js";
import { createForegroundSyncCoordinator } from "../offline/syncCoordinator.js";
import { registerStudentAppServiceWorker } from "../offline/serviceWorkerRegistration.js";
import { createStNotationAdapter } from "../practice/notationAdapter.js";
import { createScoreFollowCoordinator } from "../practice/scoreFollowCoordinator.js";
import { createViolinFollowCoordinator } from "../practice/violinFollowCoordinator.js";
import { createNotationRuntimeLoader } from "../practice/notationRuntimeLoader.js";
import { createPlaybackPlanResolver } from "../playback/playbackPlanResolver.js";
import { createPianoSampleBank } from "../playback/pianoSampleBank.js";
import { createScoreAudioRuntimeLoader } from "../playback/scoreAudioRuntimeLoader.js";
import { createStudentAudioSession } from "../playback/studentAudioSession.js";
import { createViolinAudioLane } from "../playback/violinAudioLane.js";
import { createWebAudioPianoEngine } from "../playback/webAudioPianoEngine.js";
import { createStudentPlaybackPort } from "../playback/studentPlaybackPort.js";
import { createFirebaseBrowserRuntime } from "../providers/firebase/firebaseBrowserRuntime.js";
import { createStudentAppController } from "./studentAppController.js";
import { createStudent08Composition } from "./student08Composition.js";
import { mountStudentApp } from "./mountStudentApp.js";
import { createViolinFingerboardPresentation } from "./violinFingerboard.js";

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

const AudioContextCtor =
  globalThis.AudioContext ?? globalThis.webkitAudioContext;
const audioSession = createStudentAudioSession({ AudioContextCtor });
const audioContextSupported = audioSession.isSupported();
const audioContextFactory = audioSession.audioContextFactory;

const scoreAudioRuntimeLoader = createScoreAudioRuntimeLoader({
  manifestUrl: "./vendor/st-score-audio/runtime-manifest.json",
  runtimeUrl: "./vendor/st-score-audio/st-score-audio-engine.js",
  expectedSourceRevision: "298ddd61ba3854231ff7e59a88c22c4a01530a41",
  expectedRuntimeVersion: "0.2.0",
  expectedContractVersion: "0.2.0",
});
const violinAudioLane = createViolinAudioLane({
  runtimeLoader: scoreAudioRuntimeLoader,
  audioContextFactory,
});

const playbackEngine = createWebAudioPianoEngine({
  audioContextFactory,
  audioContextSupported,
  sampleBank,
  noteRouter: violinAudioLane,
});
const playbackPort = createStudentPlaybackPort({
  playbackPlanResolver,
  engine: playbackEngine,
  violinAudioLane,
});
const scoreFollowCoordinator =
  createScoreFollowCoordinator({
    notationAdapter,
    playbackPort,
  });
const violinFingerboardPresentation =
  createViolinFingerboardPresentation({ root });
const violinFollowCoordinator =
  createViolinFollowCoordinator({
    playbackPort,
    presentationPort: violinFingerboardPresentation,
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
  scoreFollowCoordinator,
  violinFollowCoordinator,
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
