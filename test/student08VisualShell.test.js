import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("S08-4C Student shell forces a light visual theme independent from device dark mode", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /:root\s*\{[^}]*color-scheme:\s*light;/s,
  );
  assert.match(
    html,
    /--st-surface-page:\s*#f7f9fc;/,
  );
  assert.match(
    html,
    /--st-surface-panel:\s*#ffffff;/,
  );
  assert.match(
    html,
    /body\s*\{[^}]*background:\s*var\(--st-surface-page\)[^}]*color:\s*var\(--st-text\)/s,
  );
});

test("S08-4C phone layout keeps a persistent left folder rail instead of a top button row", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-shell\s*\{[^}]*grid-template-columns:\s*minmax\(5\.75rem,\s*28%\)\s+minmax\(0,\s*1fr\)[^}]*gap:\s*0/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation\s*\{[^}]*min-height:\s*100dvh/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation\s*\{[^}]*border-right:\s*1px solid var\(--st-border\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation\s*\{[^}]*border-radius:\s*0/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-navigation nav\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
});

test("S08-4C navigation reads like folders with a quiet blue selected state", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /--st-accent:\s*#3478e5;/,
  );
  assert.match(
    html,
    /--st-accent-soft:\s*#eaf2ff;/,
  );
  assert.match(
    html,
    /\.student-navigation button\[aria-current="page"\]\s*\{[^}]*background:\s*var\(--st-accent-soft\)[^}]*color:\s*var\(--st-accent\)[^}]*text-decoration:\s*none/s,
  );
  assert.match(
    html,
    /button\[data-action="show-public-pool"\]::before,[\s\S]*?button\[data-action="show-my-work"\]::before\s*\{[^}]*clip-path:\s*polygon/s,
  );
});

test("S08-4C narrow My Work content stacks lifecycle folders instead of breaking labels into tiny columns", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.work-folders\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-content\s*\{[^}]*border-radius:\s*0[^}]*border:\s*0/s,
  );
});
