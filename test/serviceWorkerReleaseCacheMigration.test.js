import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const SCOPE = "https://student.example/";

function makeResponse(body, { ok = true } = {}) {
  return {
    ok,
    body,
    clone() {
      return makeResponse(body, { ok });
    },
  };
}

function requestKey(request) {
  if (typeof request === "string") {
    return new URL(request, SCOPE).href;
  }
  return request.url;
}

test("installed stale v20/v21/v22/v23/v24/v25/v26/v27/v28/v29/v30/v31 shells migrate atomically to v32 and reopen offline", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );
  const listeners = new Map();
  const cacheEntries = new Map();
  const deletedCacheNames = [];
  let claimCalls = 0;
  let skipWaitingCalls = 0;
  let sampleCacheWriteFails = false;
  let sampleCacheOpenFails = false;

  function entriesFor(name) {
    if (!cacheEntries.has(name)) {
      cacheEntries.set(name, new Map());
    }
    return cacheEntries.get(name);
  }

  function cacheFor(name) {
    const entries = entriesFor(name);
    return {
      async addAll(assets) {
        for (const asset of assets) {
          const key = requestKey(asset);
          const body = key.endsWith("/index.html")
            ? "account-presence-usage-shell"
            : `current:${key}`;
          entries.set(key, makeResponse(body));
        }
      },
      async add(asset) {
        const key = requestKey(asset);
        entries.set(key, makeResponse(`runtime:${key}`));
      },
      async put(request, response) {
        if (name === "st-student-samples-v1" && sampleCacheWriteFails) {
          throw new Error("QuotaExceededError");
        }
        entries.set(requestKey(request), response);
      },
      async match(request) {
        return entries.get(requestKey(request));
      },
      async delete(request) {
        return entries.delete(requestKey(request));
      },
      async keys() {
        return [...entries.keys()].map((url) => ({ url }));
      },
    };
  }

  entriesFor("st-student-shell-v17").set(
    "https://student.example/index.html",
    makeResponse("older-shell"),
  );
  entriesFor("st-student-shell-v18").set(
    "https://student.example/index.html",
    makeResponse("legacy-playback-shell-entry"),
  );
  entriesFor("st-student-shell-v18").set(
    "https://student.example/src/ui/renderStudentApp.js",
    makeResponse("legacy-render-student-app"),
  );
  entriesFor("st-student-shell-v20").set(
    "https://student.example/index.html",
    makeResponse("pre-student-ui-01-shell"),
  );
  entriesFor("st-student-shell-v20").set(
    "https://student.example/src/ui/main.js",
    makeResponse("pre-student-ui-01-main"),
  );
  entriesFor("st-student-shell-v21").set(
    "https://student.example/index.html",
    makeResponse("preview-fusion-lite-shell"),
  );
  entriesFor("st-student-shell-v22").set(
    "https://student.example/index.html",
    makeResponse("dynamic-icon-metadata-shell"),
  );
  entriesFor("st-student-shell-v23").set(
    "https://student.example/index.html",
    makeResponse("static-icon-v1-shell"),
  );
  entriesFor("st-student-shell-v24").set(
    "https://student.example/index.html",
    makeResponse("icon-v2-shell-without-account-invite"),
  );
  entriesFor("st-student-shell-v25").set(
    "https://student.example/index.html",
    makeResponse("account-invite-shell-without-presence-usage"),
  );
  entriesFor("st-student-shell-v26").set(
    "https://student.example/index.html",
    makeResponse("presence-usage-shell-without-score-audio"),
  );
  entriesFor("st-student-shell-v27").set(
    "https://student.example/index.html",
    makeResponse("score-audio-shell-before-playback-fixes"),
  );
  entriesFor("st-student-shell-v28").set(
    "https://student.example/src/practice/scoreFollowIndex.js",
    makeResponse("score-follow-before-generated-tab-highlights"),
  );
  entriesFor("st-student-shell-v29").set(
    "https://student.example/vendor/st-score-runtime/modules/adapter-osmd.js",
    makeResponse("renderer-before-vf-tabnote-group-fix"),
  );

  entriesFor("st-student-shell-v30").set(
    "https://student.example/src/practice/scoreFollowIndex.js",
    makeResponse("score-follow-before-embedded-tab-highlights"),
  );

  for (const module of ["scoreFollowCoordinator.js", "notationAdapter.js"]) {
    entriesFor("st-student-shell-v31").set(
      `https://student.example/src/practice/${module}`,
      makeResponse("before-follow-startup-recovery"),
    );
  }

  const cachesObject = {
    async open(name) {
      if (name === "st-student-samples-v1" && sampleCacheOpenFails) {
        throw new Error("CacheStorage unavailable");
      }
      return cacheFor(name);
    },
    async keys() {
      return [...cacheEntries.keys()];
    },
    async delete(name) {
      deletedCacheNames.push(name);
      return cacheEntries.delete(name);
    },
  };

  let sampleNetworkOnline = true;
  let sampleNetworkCalls = 0;
  const fetchFunction = async (request) => {
    const key = requestKey(request);
    if (
      key.startsWith(
        "https://raw.githubusercontent.com/Tonejs/audio/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/",
      )
    ) {
      sampleNetworkCalls += 1;
      if (!sampleNetworkOnline) {
        throw new Error("offline");
      }
      return makeResponse(`sample:${key}`);
    }
    return makeResponse("firebase-runtime", { ok: false });
  };

  const selfObject = {
    registration: {
      scope: SCOPE,
    },
    location: {
      origin: "https://student.example",
    },
    clients: {
      async claim() {
        claimCalls += 1;
      },
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  vm.runInNewContext(source, {
    self: selfObject,
    caches: cachesObject,
    fetch: fetchFunction,
    URL,
    console,
  });

  let installPromise;
  listeners.get("install")({
    waitUntil(promise) {
      installPromise = promise;
    },
  });
  await installPromise;

  assert.equal(skipWaitingCalls, 1);
  for (const module of ["scoreFollowCoordinator.js", "notationAdapter.js"]) {
    const url = `https://student.example/src/practice/${module}`;
    assert.equal(entriesFor("st-student-shell-v31").get(url)?.body,
      "before-follow-startup-recovery", "installation preserves the active v31 modules");
    assert.equal(entriesFor("st-student-shell-v32").get(url)?.body,
      `current:${url}`, "new shell contains recovery modules");
  }
  assert.equal(
    entriesFor("st-student-shell-v30").get("https://student.example/src/practice/scoreFollowIndex.js").body,
    "score-follow-before-embedded-tab-highlights",
    "install must not overwrite bytes still used by the previous worker",
  );
  assert.equal(
    entriesFor("st-student-shell-v32").get("https://student.example/src/practice/scoreFollowIndex.js").body,
    "current:https://student.example/src/practice/scoreFollowIndex.js",
  );
  assert.equal(
    entriesFor("st-student-shell-v25")
      .get("https://student.example/index.html")
      .body,
    "account-invite-shell-without-presence-usage",
  );
  assert.equal(
    entriesFor("st-student-shell-v32")
      .get("https://student.example/index.html")
      .body,
    "account-presence-usage-shell",
  );

  for (const asset of [
    "src/ui/sign-in-fusion-lite.css",
    "src/assets/st-student-logo.png",
    "src/assets/st-student-waveform.svg",
    "src/manifest.webmanifest",
    "src/assets/st-student-icon-192.png",
    "src/assets/st-student-icon-512.png",
    "src/assets/st-student-apple-touch-icon.png",
    "src/config/accountServiceConfig.js",
    "src/auth/inviteFragment.js",
    "src/auth/inviteActivationFlow.js",
    "src/providers/accountService/accountServiceApiClient.js",
    "src/ui/inviteBootstrap.js",
    "src/ui/mountInviteActivation.js",
    "src/providers/firebase/firebasePresenceWriter.js",
    "src/account/accountUsageSessionReporter.js",
    "src/account/accountLifecycleCoordinator.js",
  ]) {
    assert.equal(
      entriesFor("st-student-shell-v32").has(
        `https://student.example/${asset}`,
      ),
      true,
      asset,
    );
  }

  let activatePromise;
  listeners.get("activate")({
    waitUntil(promise) {
      activatePromise = promise;
    },
  });
  await activatePromise;

  assert.deepEqual(deletedCacheNames, [
    "st-student-shell-v17",
    "st-student-shell-v20",
    "st-student-shell-v21",
    "st-student-shell-v22",
    "st-student-shell-v23",
    "st-student-shell-v24",
    "st-student-shell-v25",
    "st-student-shell-v26",
    "st-student-shell-v27",
    "st-student-shell-v28",
    "st-student-shell-v29",
    "st-student-shell-v30",
    "st-student-shell-v31",
  ]);
  assert.equal(claimCalls, 1);
  assert.equal(cacheEntries.has("st-student-shell-v20"), false);
  assert.equal(cacheEntries.has("st-student-shell-v21"), false);
  assert.equal(cacheEntries.has("st-student-shell-v22"), false);
  assert.equal(cacheEntries.has("st-student-shell-v23"), false);
  assert.equal(cacheEntries.has("st-student-shell-v24"), false);
  assert.equal(cacheEntries.has("st-student-shell-v25"), false);
  assert.equal(cacheEntries.has("st-student-shell-v26"), false);
  assert.equal(cacheEntries.has("st-student-shell-v27"), false);
  assert.equal(cacheEntries.has("st-student-shell-v28"), false);
  assert.equal(cacheEntries.has("st-student-shell-v29"), false);
  assert.equal(cacheEntries.has("st-student-shell-v30"), false);
  assert.equal(cacheEntries.has("st-student-shell-v31"), false);
  assert.equal(
    entriesFor("st-student-shell-v18").has(
      "https://student.example/index.html",
    ),
    false,
  );
  assert.equal(
    entriesFor("st-student-shell-v18").has(
      "https://student.example/src/ui/renderStudentApp.js",
    ),
    false,
  );

  const request = {
    method: "GET",
    url: "https://student.example/index.html",
  };
  let responsePromise;
  listeners.get("fetch")({
    request,
    respondWith(promise) {
      responsePromise = promise;
    },
  });

  const response = await responsePromise;
  assert.equal(response.body, "account-presence-usage-shell");

  listeners.get("fetch")({
    request: { method: "GET", url: "https://student.example/src/practice/scoreFollowIndex.js" },
    respondWith(promise) { responsePromise = promise; },
  });
  assert.equal((await responsePromise).body, "current:https://student.example/src/practice/scoreFollowIndex.js");

  const pianoSampleRequest = {
    method: "GET",
    url: "https://raw.githubusercontent.com/Tonejs/audio/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/C4.mp3",
  };
  listeners.get("fetch")({
    request: pianoSampleRequest,
    respondWith(promise) {
      responsePromise = promise;
    },
  });

  const onlineSampleResponse = await responsePromise;
  assert.equal(onlineSampleResponse.body, `sample:${pianoSampleRequest.url}`);
  assert.equal(sampleNetworkCalls, 1);
  assert.equal(
    entriesFor("st-student-samples-v1").has(pianoSampleRequest.url),
    true,
  );

  sampleNetworkOnline = false;
  listeners.get("fetch")({
    request: pianoSampleRequest,
    respondWith(promise) {
      responsePromise = promise;
    },
  });

  const offlineSampleResponse = await responsePromise;
  assert.equal(offlineSampleResponse.body, `sample:${pianoSampleRequest.url}`);
  assert.equal(sampleNetworkCalls, 1);

  sampleNetworkOnline = true;
  sampleCacheWriteFails = true;
  const uncachedPianoSampleRequest = {
    method: "GET",
    url: "https://raw.githubusercontent.com/Tonejs/audio/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/Ds4.mp3",
  };
  listeners.get("fetch")({
    request: uncachedPianoSampleRequest,
    respondWith(promise) {
      responsePromise = promise;
    },
  });

  const quotaLimitedResponse = await responsePromise;
  assert.equal(
    quotaLimitedResponse.body,
    `sample:${uncachedPianoSampleRequest.url}`,
  );
  assert.equal(sampleNetworkCalls, 2);
  assert.equal(
    entriesFor("st-student-samples-v1").has(uncachedPianoSampleRequest.url),
    false,
  );

  sampleCacheWriteFails = false;
  sampleCacheOpenFails = true;
  const unavailableCacheRequest = {
    method: "GET",
    url: "https://raw.githubusercontent.com/Tonejs/audio/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/Fs4.mp3",
  };
  listeners.get("fetch")({
    request: unavailableCacheRequest,
    respondWith(promise) {
      responsePromise = promise;
    },
  });

  const cacheUnavailableResponse = await responsePromise;
  assert.equal(
    cacheUnavailableResponse.body,
    `sample:${unavailableCacheRequest.url}`,
  );
  assert.equal(sampleNetworkCalls, 3);
});
