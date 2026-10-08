import test from "node:test";
import assert from "node:assert/strict";

import { runInviteActivationIfPresent } from "../src/ui/inviteBootstrap.js";

test("no invite fragment leaves normal Student App bootstrap untouched", async () => {
  const root = { innerHTML: "normal" };
  const handled = await runInviteActivationIfPresent({
    root,
    authAdapter: {},
    fetchImpl: async () => {
      throw new Error("must not fetch");
    },
    locationObject: {
      pathname: "/",
      search: "",
      hash: "#/home",
    },
    historyObject: {},
    environment: {},
  });

  assert.equal(handled, false);
  assert.equal(root.innerHTML, "normal");
});

test("invite fragment is stripped before disabled integration renders a bounded error", async () => {
  const replacements = [];
  const root = { innerHTML: "" };
  const handled = await runInviteActivationIfPresent({
    root,
    authAdapter: {},
    fetchImpl: async () => {
      throw new Error("must not fetch");
    },
    locationObject: {
      pathname: "/student/",
      search: "",
      hash: "#/invite/RAW_SECRET_TOKEN",
    },
    historyObject: {
      replaceState(_state, _title, url) {
        replacements.push(url);
      },
    },
    environment: {},
  });

  assert.equal(handled, true);
  assert.deepEqual(replacements, ["/student/"]);
  assert.match(root.innerHTML, /Davet servisi şu anda kullanılamıyor/);
  assert.equal(root.innerHTML.includes("RAW_SECRET_TOKEN"), false);
});

test("invite flow does not contact the account service when the fragment cannot be removed", async () => {
  let fetchCalls = 0;
  const root = { innerHTML: "" };
  const handled = await runInviteActivationIfPresent({
    root,
    authAdapter: {
      async getIdToken() {
        return "must-not-be-used";
      },
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not fetch");
    },
    locationObject: {
      pathname: "/student/",
      search: "",
      hash: "#/invite/RAW_SECRET_TOKEN",
    },
    historyObject: {},
    environment: {
      VITE_ACCOUNT_SERVICE_API_BASE_URL: "https://accounts.example.test",
    },
  });

  assert.equal(handled, true);
  assert.equal(fetchCalls, 0);
  assert.match(root.innerHTML, /Davet servisi şu anda kullanılamıyor/);
  assert.equal(root.innerHTML.includes("RAW_SECRET_TOKEN"), false);
});
