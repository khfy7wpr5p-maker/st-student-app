import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("browser runtime wires bounded Firebase Realtime Database presence without exposing it as assignment authority", async () => {
  const source = await readFile(
    new URL("../src/providers/firebase/firebaseBrowserRuntime.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /firebase-database\.js/);
  for (const symbol of [
    "getDatabase",
    "ref",
    "onValue",
    "onDisconnect",
    "set",
    "remove",
    "serverTimestamp",
    "createFirebaseDatabaseConfig",
    "createFirebasePresenceWriter",
    "createDisabledPresenceWriter",
    "presenceWriter",
  ]) {
    assert.match(source, new RegExp(symbol));
  }
  assert.match(source, /databaseConfig\.enabled/);
  assert.match(source, /getDatabase\(app, databaseConfig\.url\)/);
  assert.doesNotMatch(source, /const\s+realtimeDb\s*=\s*getDatabase\(app\)/);
  assert.doesNotMatch(source, /teacherId|accountStudentId|grantActive|assignment/i);
});

test("standard bootstrap attaches account lifecycle to restore, auth changes, and page teardown", async () => {
  const source = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );

  for (const symbol of [
    "createAccountServiceConfig",
    "createAccountServiceApiClient",
    "createAccountUsageSessionReporter",
    "createAccountLifecycleCoordinator",
    "accountLifecycle",
    "handleSession",
    "pagehide",
    "dispose",
  ]) {
    assert.match(source, new RegExp(symbol));
  }
  assert.match(source, /handleSession\(initialSession\)/);
  assert.match(source, /subscribe\([\s\S]*?handleSession\(session\)/);
  assert.doesNotMatch(source, /clientSessionId\s*:\s*session|studentId\s*:\s*firebase/i);
});

test("v26 offline shell contains account lifecycle modules and pinned Firebase Database runtime but never API responses", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /st-student-shell-v26/);
  assert.match(source, /firebasejs\/12\.19\.0\/firebase-database\.js/);
  for (const asset of [
    "src/providers/firebase/firebasePresenceWriter.js",
    "src/account/accountUsageSessionReporter.js",
    "src/account/accountLifecycleCoordinator.js",
  ]) {
    assert.equal(source.includes(asset), true, asset);
  }
  assert.doesNotMatch(source, /student\/sessions|presence\/\$|\/api\/student-accounts/i);
});
