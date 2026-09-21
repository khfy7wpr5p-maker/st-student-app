import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("static entry is a minimal Turkish module shell", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<html lang="tr">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /id="app"/);
  assert.match(html, /type="module"/);
  assert.match(html, /src="\.\/src\/ui\/main\.js"/);
  assert.doesNotMatch(html, /studentId|password|token|api[_-]?key/i);
});

test("default browser bootstrap contains no management or fake auth behavior", async () => {
  const source = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /createSharingManagementService|publish\(|revoke\(|password|token|api[_-]?key/i,
  );
  assert.match(source, /mountStudentApp/);
  assert.match(source, /createStudentAppController/);
});
