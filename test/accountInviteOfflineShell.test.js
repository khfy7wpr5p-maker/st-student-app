import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("account invitation modules are part of the atomic offline shell graph", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /const SHELL_CACHE_NAME = "st-student-shell-v26"/);
  for (const asset of [
    "src/config/accountServiceConfig.js",
    "src/auth/inviteFragment.js",
    "src/auth/inviteActivationFlow.js",
    "src/providers/accountService/accountServiceApiClient.js",
    "src/ui/mountInviteActivation.js",
  ]) {
    assert.equal(source.includes(asset), true, asset);
  }
  assert.doesNotMatch(source, /RAW_INVITE_TOKEN|inviteToken\s*:/);
});
