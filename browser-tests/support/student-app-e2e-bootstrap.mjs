import {
  createStudentSession,
} from "../../src/auth/session.js";
import {
  createBrowserConnectivityPort,
} from "../../src/offline/connectivityPort.js";
import {
  createIndexedDbOfflineRepository,
} from "../../src/offline/indexedDbOfflineRepository.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../../src/offline/secureDeliveryOfflineReadService.js";
import {
  createForegroundSyncCoordinator,
} from "../../src/offline/syncCoordinator.js";
import {
  createStNotationAdapter,
} from "../../src/practice/notationAdapter.js";
import {
  createNotationRuntimeLoader,
} from "../../src/practice/notationRuntimeLoader.js";
import {
  createPianoSampleBank,
} from "../../src/playback/pianoSampleBank.js";
import {
  createPlaybackPlanResolver,
} from "../../src/playback/playbackPlanResolver.js";
import {
  createStudentPlaybackPort,
} from "../../src/playback/studentPlaybackPort.js";
import {
  createWebAudioPianoEngine,
} from "../../src/playback/webAudioPianoEngine.js";
import {
  createStudentAppController,
} from "../../src/ui/studentAppController.js";
import {
  mountStudentApp,
} from "../../src/ui/mountStudentApp.js";
import {
  createSes13OnlineReadService,
  createSes13StatusServices,
  ses13CredentialsMatch,
  ses13StudentAId,
} from "./student-app-e2e-fixtures.mjs";

const root =
  document.querySelector("#app");

if (root === null) {
  throw new Error(
    "SES-13 E2E app root missing",
  );
}

const connectivityPort =
  createBrowserConnectivityPort();

const offlineRepository =
  createIndexedDbOfflineRepository({
    indexedDB: globalThis.indexedDB,
    dbName:
      "st-student-app-ses13-e2e",
  });

const onlineReadService =
  createSes13OnlineReadService();

const student08ReadService =
  createSecureDeliveryOfflineReadService({
    onlineReadService,
    offlineRepository,
    connectivityPort,
    clock: () =>
      "2026-09-25T08:30:00.000Z",
  });

const notationRuntimeLoader =
  createNotationRuntimeLoader({
    bootstrapUrl:
      "/vendor/st-score-runtime/browser-bootstrap.mjs",
    vendorUrl:
      "/vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js",
  });

const notationAdapter =
  createStNotationAdapter({
    runtimeLoader:
      notationRuntimeLoader,
  });

const playbackPlanResolver =
  createPlaybackPlanResolver();

const sampleBank =
  createPianoSampleBank({
    manifestUrl:
      "./vendor/st-piano/runtime-manifest.json",
  });

await sampleBank
  .initialize()
  .catch(() => false);

const AudioContextCtor =
  globalThis.AudioContext ??
  globalThis.webkitAudioContext;
const audioContextSupported =
  typeof AudioContextCtor === "function";
const audioContextFactory = () =>
  typeof AudioContextCtor === "function"
    ? new AudioContextCtor()
    : null;

const playbackEngine =
  createWebAudioPianoEngine({
    audioContextFactory,
    audioContextSupported,
    sampleBank,
  });

const playbackPort =
  createStudentPlaybackPort({
    playbackPlanResolver,
    engine: playbackEngine,
  });

const {
  publicationStatusService,
  secureDeliveryStatusService,
} = createSes13StatusServices();

const syncCoordinator =
  createForegroundSyncCoordinator({
    offlineRepository,
    publicationStatusService,
    secureDeliveryStatusService,
    clock: () =>
      "2026-09-25T08:31:00.000Z",
  });

const legacySharingBoundary =
  Object.freeze({
    listPublicPool() {
      throw new Error(
        "SES-13 legacy sharing boundary used",
      );
    },
    listMyWork() {
      throw new Error(
        "SES-13 legacy sharing boundary used",
      );
    },
    getPracticeItem() {
      throw new Error(
        "SES-13 legacy sharing boundary used",
      );
    },
  });

const controller =
  createStudentAppController({
    sharingService:
      legacySharingBoundary,
    student08ReadService,
    initialSession: null,
    notationAdapter,
    playbackPort,
    syncCoordinator,
  });

mountStudentApp({
  root,
  controller,
  notationAdapter,
  connectivityPort,
  requestSignIn(credentials) {
    if (
      !ses13CredentialsMatch(
        credentials,
      )
    ) {
      throw new Error(
        "SES-13 credentials rejected",
      );
    }

    return createStudentSession({
      studentId:
        ses13StudentAId(),
      email:
        credentials.email,
      displayName:
        "SES-13 Student A",
    });
  },
  requestSignOut() {
    return undefined;
  },
});

document.documentElement
  .setAttribute(
    "data-ses13-e2e-ready",
    "true",
  );
