import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

function poolState(overrides = {}) {
  return {
    student08: true,
    screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
    session: { studentId: "student-a" },
    items: [
      {
        poolItemId: "pool-1",
        title: "Yeni repertuar",
        shortDescription: "Bu hafta çalışılacak eserler",
        publishedAt: "2026-09-22T16:00:00Z",
        ...overrides,
      },
    ],
    practice: null,
  };
}

test("S08-4B Pool cards present title, short description, and publication date without exposing Practice", () => {
  const html = renderStudentApp(poolState());

  assert.match(html, /class="pool-card"/);
  assert.match(html, /class="pool-card-title">Yeni repertuar/);
  assert.match(
    html,
    /class="pool-card-description">Bu hafta çalışılacak eserler/,
  );
  assert.match(
    html,
    /<time class="pool-published-at" datetime="2026-09-22T16:00:00Z">22\.09\.2026<\/time>/,
  );
  assert.match(html, /data-action="open-pool-item"/);
  assert.doesNotMatch(
    html,
    /open-practice|open-assignment|packageId|MusicXML|audienceMode/,
  );
});

test("S08-4B Pool detail stays presentation-only and carries readable publication metadata", () => {
  const html = renderStudentApp({
    ...poolState(),
    poolDetail: {
      poolItemId: "pool-1",
      title: "Yeni repertuar",
      shortDescription: "Bu hafta çalışılacak eserler",
      detailText: "Önce 1. ve 2. bölümü yavaş çalış.",
      publishedAt: "2026-09-22T16:00:00Z",
    },
  });

  assert.match(html, /class="pool-detail"/);
  assert.match(html, /Önce 1\. ve 2\. bölümü yavaş çalış\./);
  assert.match(
    html,
    /<time class="pool-detail-published-at" datetime="2026-09-22T16:00:00Z">22\.09\.2026<\/time>/,
  );
  assert.doesNotMatch(
    html,
    /data-action="open-practice"|data-action="open-assignment"/,
  );
});

test("S08-4B Pool visual hierarchy uses reusable responsive card and metadata styling", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /\.pool-list\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*18rem\),\s*1fr\)\)/s,
  );
  assert.match(
    html,
    /\.pool-card\s*\{[^}]*padding:\s*var\(--st-space-4\)[^}]*align-content:\s*start/s,
  );
  assert.match(
    html,
    /\.pool-published-at,[\s\S]*?\.pool-detail-published-at\s*\{[^}]*font-size:\s*var\(--st-font-size-sm\)[^}]*color:\s*var\(--st-text-muted\)/s,
  );
});
