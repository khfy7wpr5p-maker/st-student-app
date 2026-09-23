import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shellUrl = new URL("../index.html", import.meta.url);

async function shellSource() {
  return readFile(shellUrl, "utf8");
}

test("S08-4B visual foundation exposes semantic spacing, radius, typography, surface, border, and focus tokens", async () => {
  const html = await shellSource();

  for (const token of [
    "--st-space-1:",
    "--st-space-2:",
    "--st-space-3:",
    "--st-space-4:",
    "--st-space-6:",
    "--st-radius-sm:",
    "--st-radius-md:",
    "--st-radius-lg:",
    "--st-font-size-sm:",
    "--st-font-size-md:",
    "--st-font-size-lg:",
    "--st-font-size-xl:",
    "--st-surface-page:",
    "--st-surface-panel:",
    "--st-surface-raised:",
    "--st-border:",
    "--st-focus-ring:",
  ]) {
    assert.equal(
      html.includes(token),
      true,
      `missing visual token: ${token}`,
    );
  }
});

test("S08-4B foundation applies reusable control, card, status, and navigation styling without changing touch target safety", async () => {
  const html = await shellSource();

  assert.match(
    html,
    /button\s*\{[^}]*min-height:\s*3rem[^}]*border-radius:\s*var\(--st-radius-md\)/s,
  );
  assert.match(
    html,
    /button:focus-visible\s*\{[^}]*outline:\s*var\(--st-focus-ring\)/s,
  );
  assert.match(
    html,
    /\.pool-card\s*\{[^}]*border:\s*1px solid var\(--st-border\)[^}]*background:\s*var\(--st-surface-raised\)/s,
  );
  assert.match(
    html,
    /\.app-status\s*\{[^}]*border-radius:\s*var\(--st-radius-sm\)[^}]*background:\s*var\(--st-surface-panel\)/s,
  );
  assert.match(
    html,
    /\.student-navigation\s*\{[^}]*background:\s*var\(--st-surface-panel\)[^}]*border:\s*1px solid var\(--st-border\)/s,
  );
});

test("S08-4B foundation gives content and Practice regions consistent surfaces while preserving the 25/75 shell contract", async () => {
  const html = await shellSource();

  assert.match(
    html,
    /\.student-shell\s*\{[^}]*grid-template-columns:\s*minmax\(12rem,\s*25%\)\s+minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    html,
    /\.student-content\s*\{[^}]*background:\s*var\(--st-surface-panel\)[^}]*border-radius:\s*var\(--st-radius-lg\)/s,
  );
  assert.match(
    html,
    /\.practice-workspace\s*>\s*section\s*\{[^}]*background:\s*var\(--st-surface-raised\)[^}]*border:\s*1px solid var\(--st-border\)/s,
  );
});
