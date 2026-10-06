import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Fusion Lite sign-in presentation is loaded without changing auth hooks", async () => {
  const mainSource = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );
  const renderSource = await readFile(
    new URL("../src/ui/renderStudentApp.js", import.meta.url),
    "utf8",
  );

  assert.match(mainSource, /sign-in-fusion-lite\.css/);
  assert.match(renderSource, /data-sign-in-email/);
  assert.match(renderSource, /data-sign-in-password/);
  assert.match(renderSource, /data-action="request-sign-in"/);
});

test("Fusion Lite styles stay scoped to the sign-in screen and preserve keyboard focus", async () => {
  const source = await readFile(
    new URL("../src/ui/sign-in-fusion-lite.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /section:has\(input\[data-sign-in-email\]\)/);
  assert.match(source, /button\[data-action="request-sign-in"\]/);
  assert.match(source, /input:focus-visible/);
  assert.match(source, /button\[data-action="request-sign-in"\]:focus-visible/);
  assert.match(source, /backdrop-filter: blur\(18px\)/);
  assert.match(source, /st-student-logo\.png/);
  assert.match(source, /st-student-waveform\.svg/);
});
