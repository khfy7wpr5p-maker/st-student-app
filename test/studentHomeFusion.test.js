import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";

const home = { student08: true, screen: "home", items: [], session: { studentId: "student-a" } };

test("Fusion home keeps exactly the existing three navigation actions and hides decorative symbols from assistive technology", () => {
  const html = renderStudentApp(home, { connectivityState: "OFFLINE" });
  assert.match(html, /Bugün ne <span>çalıyoruz\?<\/span>/);
  for (const action of ["show-public-pool", "show-my-work", "sign-out"]) {
    assert.equal(html.split(`data-action="${action}"`).length - 1, 1);
  }
  assert.match(html, /aria-label="Benim Çalışmalarım"/);
  assert.match(html, />Çalışmalarım<span/);
  assert.match(html, /aria-live="polite">Çevrimdışı<\/div>/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 3);
  assert.equal((html.match(/<img[^>]*alt=""/g) ?? []).length, 3);
  assert.doesNotMatch(html, /student-shell|["'>]student-a["'<]|https?:/);
});

test("Fusion home escapes live status and leaves other screen shells intact", () => {
  const html = renderStudentApp(home, { status: '<img src=x onerror="bad()">' });
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  for (const screen of [STUDENT_APP_SCREENS.PUBLIC_POOL, STUDENT_APP_SCREENS.MY_WORK]) {
    const other = renderStudentApp({ ...home, screen });
    assert.doesNotMatch(other, /fusion-home/);
    assert.match(other, screen === STUDENT_APP_SCREENS.MY_WORK ? /class="student-work-shell"/ : /class="student-shell"/);
  }
});

test("Fusion assets and fonts are local and part of the atomic offline shell", async () => {
  const sw = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/ui/student-home-fusion.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /https?:|@import/);
  for (const path of ["src/ui/renderStudentHome.js", "src/ui/student-home-fusion.css", "src/assets/home-fusion-pool.svg", "src/assets/home-fusion-work.svg", "src/assets/fonts/knewave.woff", "src/assets/fonts/outfit-semibold.woff", "src/assets/fonts/outfit-bold.woff"]) {
    assert.ok(sw.includes(`"./${path}"`));
    assert.ok((await readFile(new URL(`../${path}`, import.meta.url))).length > 0);
  }
});
