const CACHE_NAME = "st-student-shell-v18";
const SHELL_CACHE_NAME = "st-student-shell-v22";
const ACTIVE_CACHE_NAMES = new Set([
  CACHE_NAME,
  SHELL_CACHE_NAME,
]);

const FIREBASE_RUNTIME_ASSETS = Object.freeze([
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js",
]);

const FIREBASE_RUNTIME_URLS = new Set(FIREBASE_RUNTIME_ASSETS);

const SHELL_ASSETS = Object.freeze([
  "./",
  "./index.html",
  "./src/manifest.webmanifest",
  "./src/ui/main.js",
  "./src/ui/sign-in-fusion-lite.css",
  "./src/assets/st-student-logo.png",
  "./src/assets/st-student-waveform.svg",
  "./src/assets/st-student-icon-192.png",
  "./src/assets/st-student-icon-512.png",
  "./src/assets/st-student-apple-touch-icon.png",
  "./src/config/firebaseConfig.js",
  "./src/providers/firebase/firebaseBrowserRuntime.js",
  "./src/providers/firebase/firebaseAuthAdapter.js",
  "./src/providers/firebase/firestoreSharingAdapter.js",
  "./src/providers/firebase/firestorePackageTransport.js",
  "./src/ui/studentAppController.js",
  "./src/ui/mountStudentApp.js",
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
  "./src/playback/studentPlaybackPort.js",
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
              name.startsWith("st-student-shell-") &&
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

  if (!shellRequest && !playbackStaticRequest && !firebaseRuntimeRequest) {
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