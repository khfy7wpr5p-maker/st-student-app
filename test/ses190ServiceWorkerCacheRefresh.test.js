import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("SES-190 shell refresh invariants remain covered by the newer v21 shell", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const SHELL_CACHE_NAME = "st-student-shell-v21"/,
  );
  assert.match(source, /src\/ui\/renderStudentApp\.js/);
  assert.match(source, /src\/ui\/studentAppController\.js/);
  assert.match(source, /src\/ui\/shellActions\.js/);
  assert.match(source, /src\/ui\/mountStudentApp\.js/);
  assert.match(source, /!ACTIVE_CACHE_NAMES\.has\(name\)/);
  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
});
