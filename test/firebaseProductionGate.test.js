import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

test("production Firebase target is explicit and never uses the emulator project", async () => {
  const firebaseRc = await readJson("../.firebaserc");
  assert.equal(firebaseRc.projects?.production, "st-student-app-85cde");
  assert.notEqual(firebaseRc.projects?.production, "demo-st-student-account");
});

test("project-wide Firebase config preserves ST Student Firestore rules and adds presence rules", async () => {
  const config = await readJson("../firebase.json");
  assert.equal(config.firestore?.rules, "firebase/firestore.rules");
  assert.equal(config.firestore?.indexes, "firebase/firestore.indexes.json");
  assert.equal(config.database?.rules, "firebase/database.rules.json");

  const firestoreRules = await readFile(
    new URL("../firebase/firestore.rules", import.meta.url),
    "utf8",
  );
  assert.match(firestoreRules, /publicPublications/);
  assert.match(firestoreRules, /students\/\{studentId\}/);
  assert.match(firestoreRules, /allow write:\s*if false/);
  for (const privateCollection of [
    "studentInvitations",
    "studentAccounts",
    "teacherStudentRelationships",
    "studentUsage",
    "identityMappings",
    "identityDomainBindings",
    "teacherStudentGrants",
    "secureDeliveryProvisioningAudit",
  ]) {
    assert.doesNotMatch(
      firestoreRules,
      new RegExp(`allow\\s+(read|write).*${privateCollection}`),
    );
  }

  const databaseRules = await readJson("../firebase/database.rules.json");
  assert.equal(databaseRules.rules?.[".read"], false);
  assert.equal(databaseRules.rules?.[".write"], false);
  assert.equal(
    databaseRules.rules?.presence?.["$uid"]?.[".write"],
    "auth != null && auth.uid === $uid",
  );
});

test("production Firestore index manifest adds no speculative composite indexes", async () => {
  const indexes = await readJson("../firebase/firestore.indexes.json");
  assert.deepEqual(indexes.indexes, []);
  assert.deepEqual(indexes.fieldOverrides, []);
});

test("Gate 5 runbook pins TTL to account-service usage sessions only", async () => {
  const runbook = await readFile(
    new URL("../docs/production/account-service-firebase-gate.md", import.meta.url),
    "utf8",
  );
  assert.match(runbook, /st-student-app-85cde/);
  assert.match(runbook, /collection-group=sessions/);
  assert.match(runbook, /expiresAt/);
  assert.match(runbook, /--enable-ttl/);
  assert.match(runbook, /firebase deploy --project st-student-app-85cde --only firestore:rules,firestore:indexes,database/);
  assert.match(runbook, /demo-st-student-account/);
});
