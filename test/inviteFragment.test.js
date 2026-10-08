import test from "node:test";
import assert from "node:assert/strict";

import {
  parseInviteFragment,
  stripInviteFragment,
} from "../src/auth/inviteFragment.js";

test("invite fragment parser accepts only the bounded fragment route", () => {
  assert.equal(parseInviteFragment("#/invite/token-ABC_123"), "token-ABC_123");
  assert.equal(parseInviteFragment("#/invite/"), null);
  assert.equal(parseInviteFragment("#/invite/token?leak=yes"), null);
  assert.equal(parseInviteFragment("#invite/token"), null);
  assert.equal(parseInviteFragment("#/home"), null);
});

test("invite fragment is removed from the visible URL without copying the token", () => {
  const replacements = [];
  const locationObject = {
    pathname: "/student/",
    search: "?lang=tr",
    hash: "#/invite/RAW_SECRET_TOKEN",
  };
  const historyObject = {
    replaceState(_state, _title, url) {
      replacements.push(url);
    },
  };

  stripInviteFragment({ historyObject, locationObject });

  assert.deepEqual(replacements, ["/student/?lang=tr"]);
  assert.equal(JSON.stringify(replacements).includes("RAW_SECRET_TOKEN"), false);
});
