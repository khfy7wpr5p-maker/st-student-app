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

test("installed stale v20/v21/v22/v23/v24/v25 shells migrate atomically to v26 and reopen offline", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );
  const listeners = new Map();
  const cacheEntries = new Map();
  const deletedCacheNames = [];
  let claimCalls = 0;
  let skipWaitingCalls = 0;

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
        entries.set(requestKey(request), response);
      },
      async match(request) {
        return entries.get(requestKey(request));
      },
      async delete(request) {
        return entries.delete(requestKey(request));
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

  const cachesObject = {
    async open(name) {
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

  const fetchFunction = async () =>
    makeResponse("firebase-runtime", { ok: false });

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
  assert.equal(
    entriesFor("st-student-shell-v25")
      .get("https://student.example/index.html")
      .body,
    "account-invite-shell-without-presence-usage",
  );
  assert.equal(
    entriesFor("st-student-shell-v26")
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
      entriesFor("st-student-shell-v26").has(
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
  ]);
  assert.equal(claimCalls, 1);
  assert.equal(cacheEntries.has("st-student-shell-v20"), false);
  assert.equal(cacheEntries.has("st-student-shell-v21"), false);
  assert.equal(cacheEntries.has("st-student-shell-v22"), false);
  assert.equal(cacheEntries.has("st-student-shell-v23"), false);
  assert.equal(cacheEntries.has("st-student-shell-v24"), false);
  assert.equal(cacheEntries.has("st-student-shell-v25"), false);
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
});
