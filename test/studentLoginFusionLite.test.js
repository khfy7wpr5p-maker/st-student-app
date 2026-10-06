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

test("Fusion Lite desktop composition stays compact and waveform remains visually subdued", async () => {
  const css = await readFile(
    new URL("../src/ui/sign-in-fusion-lite.css", import.meta.url),
    "utf8",
  );
  const waveform = await readFile(
    new URL("../assets/st-student-waveform.svg", import.meta.url),
    "utf8",
  );

  assert.match(css, /width:\s*min\(100%,\s*46rem\)/);
  assert.match(css, /min-height:\s*17rem/);
  assert.match(css, /center\s*\/\s*78%\s+auto\s+no-repeat/);
  assert.match(waveform, /opacity="0\.14"/);
  assert.match(waveform, /opacity="0\.78"/);
});

test("installable app metadata exposes ST Student icons for home-screen installation", async () => {
  const mainSource = await readFile(
    new URL("../src/ui/main.js", import.meta.url),
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile(
      new URL("../manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  );

  assert.match(mainSource, /manifest\.webmanifest/);
  assert.match(mainSource, /st-student-apple-touch-icon\.png/);
  assert.match(mainSource, /theme-color/);
  assert.match(mainSource, /#eef9ff/i);

  assert.equal(manifest.name, "ST Student");
  assert.equal(manifest.short_name, "ST Student");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.theme_color, "#eef9ff");
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })),
    [
      {
        src: "./assets/st-student-icon-192.png",
        sizes: "192x192",
        purpose: "any maskable",
      },
      {
        src: "./assets/st-student-icon-512.png",
        sizes: "512x512",
        purpose: "any maskable",
      },
    ],
  );
});
