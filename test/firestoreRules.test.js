import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Firestore rules keep public authenticated and private uid-scoped", async () => {
  const source = await readFile(
    new URL("../firebase/firestore.rules", import.meta.url),
    "utf8",
  );

  assert.match(source, /request\.auth\s*!=\s*null/);
  assert.match(source, /request\.auth\.uid\s*==\s*studentId/);
  assert.match(source, /allow write:\s*if false/);
  assert.match(source, /revokedAt\s*==\s*null/);
  assert.match(source, /publicPublications/);
  assert.match(source, /students\/\{studentId\}/);
  assert.doesNotMatch(source, /packages\/\{packageId\}/);
});
