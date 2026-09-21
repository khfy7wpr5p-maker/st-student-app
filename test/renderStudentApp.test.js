import test from "node:test";
import assert from "node:assert/strict";

import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

test("sign in screen has a clear heading and sign-in action", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.SIGN_IN,
    session: null,
    items: [],
    practice: null,
  });

  assert.match(html, /<h1[^>]*>ST Student<[/]h1>/);
  assert.match(html, /data-action="request-sign-in"/);
  assert.match(html, /aria-live="polite"/);
});

test("home exposes only the minimal navigation", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.HOME,
    session: { studentId: "student-a", displayName: "Ali" },
    items: [],
    practice: null,
  });

  assert.match(html, /Havuz/);
  assert.match(html, /Benim Çalışmalarım/);
  assert.match(html, /Çıkış/);
  assert.doesNotMatch(html, /Mesaj|Puan|Sıralama|Ödeme/);
});

test("Public Pool renders semantic work list and open actions", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
    session: { studentId: "student-a" },
    items: [
      {
        publicationId: "pub-1",
        packageId: "pkg-1",
        title: "Etüt 1",
      },
    ],
    practice: null,
  });

  assert.match(html, /<h1[^>]*>Havuz<[/]h1>/);
  assert.match(html, /<ul/);
  assert.match(html, /Etüt 1/);
  assert.match(html, /data-action="open-practice"/);
  assert.match(html, /data-publication-id="pub-1"/);
});

test("My Work has a visible empty state", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.MY_WORK,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
  });

  assert.match(html, /<h1[^>]*>Benim Çalışmalarım<[/]h1>/);
  assert.match(html, /Henüz atanmış çalışma yok/);
});

test("practice screen delegates to capability-aware workspace renderer", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.PRACTICE,
    session: { studentId: "student-a" },
    items: [],
    practice: {
      publicationId: "pub-1",
      packageId: "pkg-1",
      title: "Etüt 1",
      capabilities: {
        notation: "AVAILABLE",
        playback: "UNAVAILABLE",
        tempoChange: "UNAVAILABLE",
        measureRepeat: "UNAVAILABLE",
        guitarTab: "UNAVAILABLE",
        violin: "UNAVAILABLE",
      },
      practice: { tempoBpm: 80 },
    },
  });

  assert.match(html, /<h1[^>]*>Etüt 1<[/]h1>/);
  assert.match(html, /data-action="go-home"/);
  assert.match(html, /id="st-score-root"/);
  assert.match(html, /Dinleme bu çalışma için kullanılamıyor/);
  assert.doesNotMatch(html, /publicationId|packageId|MusicXML|score-partwise/);
});

test("dynamic work titles are HTML-escaped", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
    session: { studentId: "student-a" },
    items: [
      {
        publicationId: "pub-1",
        packageId: "pkg-1",
        title: '<img src=x onerror="alert(1)">',
      },
    ],
    practice: null,
  });

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("renderer does not expose private or internal fields even if extra state appears", () => {
  const html = renderStudentApp({
    screen: STUDENT_APP_SCREENS.PRACTICE,
    session: { studentId: "student-a" },
    items: [],
    practice: {
      publicationId: "pub-1",
      packageId: "pkg-1",
      title: "Safe title",
      recipientStudentId: "student-a",
      musicXml: "<score-partwise>secret</score-partwise>",
      omr: { trace: "secret" },
      debug: "secret",
    },
  });

  assert.doesNotMatch(
    html,
    /"student-a"|>student-a<|score-partwise|recipientStudentId|omr|debug|secret/,
  );
});


test("configured sign-in renders bounded email and password fields", () => {
  const html = renderStudentApp(
    {
      screen: STUDENT_APP_SCREENS.SIGN_IN,
      session: null,
      items: [],
      practice: null,
    },
    { signInAvailable: true },
  );

  assert.match(html, /type="email"/);
  assert.match(html, /data-sign-in-email/);
  assert.match(html, /autocomplete="email"/);
  assert.match(html, /type="password"/);
  assert.match(html, /data-sign-in-password/);
  assert.match(html, /autocomplete="current-password"/);
  assert.doesNotMatch(html, /value="[^"]+"/);
});
