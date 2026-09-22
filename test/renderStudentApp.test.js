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


function playbackPracticeState({
  quality = "APPROXIMATE",
  repeat = false,
} = {}) {
  return {
    screen: STUDENT_APP_SCREENS.PRACTICE,
    session: { studentId: "student-a" },
    items: [],
    practice: {
      publicationId: "pub-play",
      packageId: "pkg-play",
      title: "Playback Etüt",
      playbackQuality: quality,
      capabilities: {
        notation: "AVAILABLE",
        playback: "AVAILABLE",
        tempoChange: "AVAILABLE",
        measureRepeat: "AVAILABLE",
        guitarTab: "UNAVAILABLE",
        violin: "UNAVAILABLE",
      },
      practice: {
        tempoBpm: 80,
        measureRepeatEnabled: repeat,
      },
    },
  };
}

test("APPROXIMATE playback renders bounded quality and teacher-gated controls", () => {
  const html = renderStudentApp(playbackPracticeState({
    quality: "APPROXIMATE",
    repeat: true,
  }));

  assert.match(
    html,
    /<p class="practice-playback-quality">Yaklaşık çalma<\/p>/,
  );
  assert.match(html, /data-action="play-practice">Dinle/);
  assert.match(html, /data-action="pause-practice">Duraklat/);
  assert.match(html, /data-action="restart-practice">Baştan/);
  assert.match(html, /min="20"/);
  assert.match(html, /max="300"/);
  assert.match(
    html,
    /type="checkbox" data-action="set-measure-repeat" checked/,
  );
});

test("FULL playback does not render approximate quality claim", () => {
  const html = renderStudentApp(playbackPracticeState({ quality: "FULL" }));

  assert.doesNotMatch(html, /Yaklaşık çalma/);
  assert.match(html, /<h2 id="playback-heading">Dinleme<\/h2>/);
});

test("playback renderer never exposes private plan or provider detail", () => {
  const state = playbackPracticeState();
  state.practice.playbackPlan = {
    notes: [{ midi: 60 }],
    providerSecret: "do-not-render",
  };
  state.practice.musicXml = "<score-partwise>private</score-partwise>";

  const html = renderStudentApp(state);

  assert.doesNotMatch(
    html,
    /playbackPlan|providerSecret|do-not-render|score-partwise|private/,
  );
});
