const CACHE_NAME = "st-student-shell-v18";
const SHELL_CACHE_NAME = "st-student-shell-v32";
const SAMPLE_CACHE_NAME = "st-student-samples-v1";
const SAMPLE_CACHE_LIMIT = 96;
const ACTIVE_CACHE_NAMES = new Set([
  CACHE_NAME,
  SHELL_CACHE_NAME,
  SAMPLE_CACHE_NAME,
]);

const EXTERNAL_SAMPLE_PATH_PREFIXES = Object.freeze([
  "/Tonejs/audio/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/",
  "/freepats/spanish-classical-guitar/6f4eb1b092acc88f5448cea1a0001bd07b971af8/samples/",
  "/sgossner/VSCO-2-CE/1.1.0/Strings/Solo%20Violin/Arco%20Vib/",
]);

const FIREBASE_RUNTIME_ASSETS = Object.freeze([
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js",
]);

const FIREBASE_RUNTIME_URLS = new Set(FIREBASE_RUNTIME_ASSETS);

const SHELL_ASSETS = Object.freeze([
  "./",
  "./index.html",
  "./src/manifest.webmanifest",
  "./src/ui/main.js",
  "./src/ui/inviteBootstrap.js",
  "./src/ui/mountInviteActivation.js",
  "./src/ui/sign-in-fusion-lite.css",
  "./src/assets/st-student-logo.png",
  "./src/assets/st-student-waveform.svg",
  "./src/assets/st-student-icon-192.png",
  "./src/assets/st-student-icon-512.png",
  "./src/assets/st-student-apple-touch-icon.png",
  "./src/config/firebaseConfig.js",
  "./src/config/accountServiceConfig.js",
  "./src/account/accountUsageSessionReporter.js",
  "./src/account/accountLifecycleCoordinator.js",
  "./src/providers/firebase/firebaseBrowserRuntime.js",
  "./src/providers/firebase/firebaseAuthAdapter.js",
  "./src/providers/firebase/firebasePresenceWriter.js",
  "./src/providers/firebase/firestoreSharingAdapter.js",
  "./src/providers/firebase/firestorePackageTransport.js",
  "./src/providers/accountService/accountServiceApiClient.js",
  "./src/ui/studentAppController.js",
  "./src/ui/studentPerfA.js",
  "./src/ui/mountStudentApp.js",
  "./src/ui/mountStudentAppPerfA.js",
  "./src/ui/renderStudentApp.js",
  "./src/ui/renderPracticeWorkspace.js",
  "./src/ui/shellActions.js",
  "./src/ui/escapeHtml.js",
  "./src/practice/notationAdapter.js",
  "./src/practice/notationViewport.js",
  "./src/practice/notationRuntimeLoader.js",
  "./src/practice/scoreFollowIndex.js",
  "./src/practice/scoreFollowCoordinator.js",
  "./src/practice/violinFollowCoordinator.js",
  "./src/ui/violinFingerboard.js",
  "./vendor/st-violin-learning/runtime-manifest.json",
  "./vendor/st-violin-learning/src/firstPosition.js",
  "./vendor/st-violin-learning/src/followSnapshot.js",
  "./vendor/st-violin-learning/src/index.js",
  "./src/playback/playbackPlan.js",
  "./src/playback/musicXmlPlaybackDom.js",
  "./src/playback/musicXmlApproximatePlayback.js",
  "./src/playback/playbackPlanResolver.js",
  "./src/playback/pianoSampleBank.js",
  "./src/playback/webAudioPianoEngine.js",
  "./src/playback/scoreAudioVoiceAdapter.js",
  "./src/playback/studentPlaybackPort.js",
  "./vendor/st-score-audio/st-score-audio-engine.js",
  "./vendor/st-score-audio/runtime-manifest.json",
  "./vendor/st-score-runtime/browser-bootstrap.mjs",
  "./vendor/st-score-runtime/runtime-manifest.json",
  "./vendor/st-score-runtime/THIRD_PARTY_NOTICES.md",
  "./vendor/st-score-runtime/licenses/opensheetmusicdisplay-BSD-3-Clause.txt",
  "./vendor/st-score-runtime/modules/adapter-osmd.js",
  "./vendor/st-score-runtime/modules/browser-host.js",
  "./vendor/st-score-runtime/modules/contracts.js",
  "./vendor/st-score-runtime/modules/osmd-module-shim.mjs",
  "./vendor/st-score-runtime/modules/renderer-core.js",
  "./vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js",
  "./src/practice/practiceCapabilities.js",
  "./src/practice/practiceWorkspace.js",
  "./src/auth/session.js",
  "./src/auth/inviteFragment.js",
  "./src/auth/inviteActivationFlow.js",
  "./src/contracts/practicePackage.js",
  "./src/sharing/deliveryItem.js",
  "./src/sharing/accessPolicy.js",
  "./src/sharing/packageEligibility.js",
  "./src/sharing/publication.js",
  "./src/offline/connectivityPort.js",
  "./src/offline/defaultOfflineInfrastructure.js",
  "./src/offline/syncCoordinator.js",
  "./src/offline/offlineRecord.js",
  "./src/offline/indexedDbOfflineRepository.js",
  "./src/offline/offlineAwareSharingService.js",
  "./src/offline/serviceWorkerRegistration.js",
  "./src/config/secureDeliveryConfig.js",
  "./src/ui/student08Composition.js",
  "./src/providers/secureDelivery/secureDeliveryApiClient.js",
  "./src/sharing/secureDeliveryStudent08ReadService.js",
  "./src/contracts/privateAssignment.js",
  "./src/contracts/studentPoolView.js",
  "./src/contracts/pieceAssignment.js",
  "./src/contracts/secureDeliveryAssignment.js",
  "./src/contracts/secureDeliveryPackage.js",
  "./src/contracts/studentChordBoardPackage.js",
  "./src/practice/practiceAccessRef.js",
  "./src/ui/chordBoardViewModel.js",
  "./src/ui/chordDiagramSvg.js",
  "./src/ui/renderChordBoardWorkspace.js",
  "./src/ui/pieceWorkspaceViewModel.js",
  "./src/ui/renderPieceWorkspace.js",
  "./src/offline/secureDeliveryOfflineReadService.js",
  "./src/offline/secureDeliveryStatusService.js",
  "./src/offline/pieceOfflineRecord.js",
]);

const PLAYBACK_STATIC_ASSETS = Object.freeze([
  "./vendor/st-piano/runtime-manifest.json",
  "./vendor/st-piano/LICENSE.txt",
  "./vendor/st-piano/THIRD_PARTY_NOTICES.md",
  "./vendor/st-piano/samples/C4.wav",
  "./vendor/st-piano/samples/Cs4.wav",
  "./vendor/st-piano/samples/D4.wav",
  "./vendor/st-piano/samples/Ds4.wav",
  "./vendor/st-piano/samples/E4.wav",
  "./vendor/st-piano/samples/F4.wav",
  "./vendor/st-piano/samples/Fs4.wav",
  "./vendor/st-piano/samples/G4.wav",
  "./vendor/st-piano/samples/Gs4.wav",
  "./vendor/st-piano/samples/A4.wav",
  "./vendor/st-piano/samples/As4.wav",
  "./vendor/st-piano/samples/B4.wav",
]);

const SHELL_ASSET_PATHS = new Set(
  SHELL_ASSETS.map(
    (asset) => new URL(asset, self.registration.scope).pathname,
  ),
);

const PLAYBACK_ASSET_PATHS = new Set(
  PLAYBACK_STATIC_ASSETS.map(
    (asset) => new URL(asset, self.registration.scope).pathname,
  ),
);

function isPinnedExternalSampleUrl(url) {
  return url.origin === "https://raw.githubusercontent.com" &&
    EXTERNAL_SAMPLE_PATH_PREFIXES.some((prefix) =>
      url.pathname.startsWith(prefix),
    );
}

async function trimSampleCache(cache) {
  const requests = await cache.keys();
  const overflow = requests.length - SAMPLE_CACHE_LIMIT;
  if (overflow <= 0) {
    return;
  }

  await Promise.all(
    requests.slice(0, overflow).map((request) => cache.delete(request)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      let cache = await caches.open(SHELL_CACHE_NAME);
      await cache.addAll(SHELL_ASSETS);

      cache = await caches.open(CACHE_NAME);
      for (const asset of PLAYBACK_STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch {
          // Playback assets are best-effort. A missing piano file must not
          // prevent the required Student App shell from installing.
        }
      }

      await Promise.all(
        FIREBASE_RUNTIME_ASSETS.map(async (asset) => {
          try {
            const response = await fetch(asset, { mode: "cors" });

            if (response?.ok === true) {
              await cache.put(asset, response.clone());
            }
          } catch {
            // Firebase runtime caching is best-effort. A failed CDN prefetch
            // must not prevent the same-origin Student App shell from installing.
          }
        }),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith("st-student-shell-") ||
                name.startsWith("st-student-samples-")) &&
              !ACTIVE_CACHE_NAMES.has(name),
          )
          .map((name) => caches.delete(name)),
      );

      const legacyCache = await caches.open(CACHE_NAME);
      await Promise.all(
        SHELL_ASSETS.map((asset) => legacyCache.delete(asset)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  const firebaseRuntimeRequest = FIREBASE_RUNTIME_URLS.has(url.href);
  const shellRequest =
    url.origin === self.location.origin &&
    SHELL_ASSET_PATHS.has(url.pathname);
  const playbackStaticRequest =
    url.origin === self.location.origin &&
    PLAYBACK_ASSET_PATHS.has(url.pathname);
  const externalSampleRequest = isPinnedExternalSampleUrl(url);

  if (
    !shellRequest &&
    !playbackStaticRequest &&
    !firebaseRuntimeRequest &&
    !externalSampleRequest
  ) {
    return;
  }

  if (shellRequest) {
    event.respondWith(
      caches.open(SHELL_CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached !== undefined) {
            return cached;
          }

          return fetch(event.request).then(async (response) => {
            if (response?.ok === true) {
              await cache.put(event.request, response.clone());
            }

            return response;
          });
        }),
      ),
    );
    return;
  }

  if (externalSampleRequest) {
    event.respondWith(
      (async () => {
        let cache;
        try {
          cache = await caches.open(SAMPLE_CACHE_NAME);
          const cached = await cache.match(event.request);
          if (cached !== undefined) {
            return cached;
          }
        } catch {
          // Cache Storage is best-effort. Network playback must remain usable
          // when private browsing or storage quota blocks persistence.
        }

        const response = await fetch(event.request);
        if (response?.ok === true && cache !== undefined) {
          try {
              await cache.put(event.request, response.clone());
              await trimSampleCache(cache);
          } catch {
            // A successful sample response must not fail playback because the
            // best-effort offline cache is unavailable or full.
          }
        }

        return response;
      })(),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached !== undefined) {
          return cached;
        }

        return fetch(event.request).then(async (response) => {
          if (response?.ok === true) {
            await cache.put(event.request, response.clone());
          }

          return response;
        });
      }),
    ),
  );
});
