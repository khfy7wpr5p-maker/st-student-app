import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

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
  return typeof request === "string" ? request : request.url;
}

test("an existing stale Student shell is refreshed online and reused offline", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );
  const listeners = new Map();
  const entries = new Map();
  const request = {
    method: "GET",
    url: "https://student.example/index.html",
  };
  entries.set(request.url, makeResponse("old-chip-layout"));

  const cache = {
    async addAll() {},
    async add() {},
    async put(cacheRequest, response) {
      entries.set(requestKey(cacheRequest), response);
    },
  };

  const cachesObject = {
    async open(name) {
      assert.equal(name, "st-student-shell-v18");
      return cache;
    },
    async match(cacheRequest) {
      return entries.get(requestKey(cacheRequest));
    },
    async keys() {
      return ["st-student-shell-v18"];
    },
    async delete() {
      return false;
    },
  };

  let networkMode = "online";
  const fetchFunction = async (fetchRequest) => {
    if (networkMode === "offline") {
      throw new Error("offline");
    }

    if (typeof fetchRequest === "string") {
      return makeResponse("firebase-runtime", { ok: false });
    }

    return makeResponse("compact-work-title-link");
  };

  const selfObject = {
    registration: {
      scope: "https://student.example/",
    },
    location: {
      origin: "https://student.example",
    },
    clients: {
      async claim() {},
    },
    async skipWaiting() {},
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

  const fetchListener = listeners.get("fetch");
  assert.equal(typeof fetchListener, "function");

  let onlineResponsePromise;
  fetchListener({
    request,
    respondWith(promise) {
      onlineResponsePromise = promise;
    },
  });

  const onlineResponse = await onlineResponsePromise;
  assert.equal(onlineResponse.body, "compact-work-title-link");
  assert.equal(
    entries.get(request.url).body,
    "compact-work-title-link",
  );

  networkMode = "offline";
  let offlineResponsePromise;
  fetchListener({
    request,
    respondWith(promise) {
      offlineResponsePromise = promise;
    },
  });

  const offlineResponse = await offlineResponsePromise;
  assert.equal(offlineResponse.body, "compact-work-title-link");
});
