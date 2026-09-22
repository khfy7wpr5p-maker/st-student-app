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

test("default bootstrap wires only the ST-owned notation adapter", async () => {
  const source = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /createStNotationAdapter/);
  assert.match(source, /notationAdapter/);
  assert.match(
    source,
    /vendor\/st-score-runtime\/vendor\/opensheetmusicdisplay\.min\.js/,
  );
  assert.doesNotMatch(
    source,
    /new\s+OSMD|from\s+["'](?:osmd|opensheetmusicdisplay)["']/i,
  );
  assert.doesNotMatch(source, /https?:\/\/|cdn|score-partwise|fake.*playback/i);
});

test("Student App package adds no direct OSMD dependency", async () => {
  const source = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  const pkg = JSON.parse(source);
  const dependencies = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  };

  assert.equal("opensheetmusicdisplay" in dependencies, false);
  assert.equal("osmd" in dependencies, false);
});


test("default bootstrap wires provider-neutral offline infrastructure without Firebase secrets", async () => {
  const source = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /createDefaultOfflineInfrastructure/);
  assert.match(source, /connectivityPort/);
  assert.doesNotMatch(
    source,
    /apiKey|projectId|authDomain|accessToken|refreshToken|getStorage|firebase[/]storage|uploadBytes/i,
  );
  assert.doesNotMatch(source, /createStudentSession|studentId\s*:/);
});


test("browser bootstrap uses the Firebase provider runtime without Analytics or Storage", async () => {
  const source = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /createFirebaseBrowserRuntime/);
  assert.match(source, /restoreSession/);
  assert.match(source, /requestSignIn/);
  assert.match(source, /requestSignOut/);
  assert.doesNotMatch(source, /getAnalytics|getStorage|uploadBytes/);
});


test("static shell declares the pinned local renderer import map without eager renderer execution", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  for (const mapping of [
    '"@st/score-renderer-contracts": "./vendor/st-score-runtime/modules/contracts.js"',
    '"@st/score-renderer-core": "./vendor/st-score-runtime/modules/renderer-core.js"',
    '"@st/score-renderer-osmd": "./vendor/st-score-runtime/modules/adapter-osmd.js"',
    '"@st/score-renderer-browser-host": "./vendor/st-score-runtime/modules/browser-host.js"',
    '"opensheetmusicdisplay": "./vendor/st-score-runtime/modules/osmd-module-shim.mjs"',
  ]) {
    assert.equal(html.includes(mapping), true);
  }

  assert.doesNotMatch(html, /<script[^>]+src=["'][^"']*browser-bootstrap\.mjs/i);
  assert.doesNotMatch(html, /<script[^>]+src=["'][^"']*opensheetmusicdisplay\.min\.js/i);
});
