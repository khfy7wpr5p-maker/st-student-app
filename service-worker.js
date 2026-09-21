const CACHE_NAME = "st-student-shell-v1";

const SHELL_ASSETS = Object.freeze([
  "./",
  "./index.html",
  "./src/ui/main.js",
  "./src/ui/studentAppController.js",
  "./src/ui/mountStudentApp.js",
  "./src/ui/renderStudentApp.js",
  "./src/ui/renderPracticeWorkspace.js",
  "./src/ui/shellActions.js",
  "./src/ui/escapeHtml.js",
  "./src/practice/notationAdapter.js",
  "./src/practice/practiceCapabilities.js",
  "./src/practice/practiceWorkspace.js",
  "./src/auth/session.js",
  "./src/contracts/practicePackage.js",
  "./src/sharing/deliveryItem.js",
  "./src/sharing/packageEligibility.js",
  "./src/sharing/publication.js",
  "./src/offline/connectivityPort.js",
  "./src/offline/defaultOfflineInfrastructure.js",
  "./src/offline/syncCoordinator.js",
  "./src/offline/offlineRecord.js",
  "./src/offline/indexedDbOfflineRepository.js",
  "./src/offline/offlineAwareSharingService.js",
  "./src/offline/serviceWorkerRegistration.js",
]);

const SHELL_ASSET_PATHS = new Set(
  SHELL_ASSETS.map(
    (asset) => new URL(asset, self.registration.scope).pathname,
  ),
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith("st-student-shell-") &&
              name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (!SHELL_ASSET_PATHS.has(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached !== undefined) {
        return cached;
      }

      return fetch(event.request).then(async (response) => {
        if (response?.ok === true) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }

        return response;
      });
    }),
  );
});
