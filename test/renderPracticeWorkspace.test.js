import test from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_CAPABILITY_STATES } from "../src/practice/practiceCapabilities.js";
import { renderPracticeWorkspace } from "../src/ui/renderPracticeWorkspace.js";

function makePractice(overrides = {}) {
  const capabilities = {
    notation: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    playback: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    tempoChange: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    measureRepeat: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    guitarTab: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    violin: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    ...(overrides.capabilities ?? {}),
  };

  return {
    publicationId: "pub-1",
    packageId: "pkg-1",
    title: overrides.title ?? "Etüt 1",
    capabilities,
    practice: {
      tempoBpm: overrides.tempoBpm ?? 80,
    },
    musicXml: "<score-partwise>SHOULD NOT RENDER</score-partwise>",
    recipientStudentId: "student-a",
    debug: "internal secret",
  };
}

test("AVAILABLE notation renders only the renderer-owned root", () => {
  const html = renderPracticeWorkspace(
    makePractice({
      capabilities: {
        notation: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      },
    }),
  );

  assert.match(html, /<h1[^>]*>Etüt 1<[/]h1>/);
  assert.match(html, /id="st-score-root"/);
  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Nota"/);
  assert.doesNotMatch(html, /score-partwise|SHOULD NOT RENDER/);
});

test("UNAVAILABLE notation shows a short bounded message", () => {
  const html = renderPracticeWorkspace(makePractice());

  assert.doesNotMatch(html, /id="st-score-root"/);
  assert.match(html, /Nota görünümü bu çalışma için kullanılamıyor/);
});

test("ERROR notation stays local and exposes no runtime details", () => {
  const html = renderPracticeWorkspace(
    makePractice({
      capabilities: {
        notation: PRACTICE_CAPABILITY_STATES.ERROR,
      },
    }),
  );

  assert.match(html, /Nota görüntülenemedi/);
  assert.doesNotMatch(
    html,
    /score-partwise|MusicXML|stack|exception|internal secret|student-a/,
  );
});

test("playback unavailable never renders fake enabled playback controls", () => {
  const html = renderPracticeWorkspace(makePractice());

  assert.doesNotMatch(html, /data-action="play-practice"/);
  assert.doesNotMatch(html, /data-action="pause-practice"/);
  assert.doesNotMatch(html, /data-action="restart-practice"/);
  assert.match(html, /Dinleme bu çalışma için kullanılamıyor/);
});

test("trusted playback capability renders usable controls only", () => {
  const html = renderPracticeWorkspace(
    makePractice({
      capabilities: {
        playback: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        tempoChange: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        measureRepeat: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      },
    }),
  );

  assert.match(html, /data-action="play-practice"/);
  assert.match(html, /data-action="pause-practice"/);
  assert.match(html, /data-action="restart-practice"/);
  assert.match(html, /data-practice-tempo/);
  assert.match(html, /data-action="set-practice-tempo"/);
  assert.match(html, /data-action="set-measure-repeat"/);
});

test("tempo metadata appears only when positive and finite", () => {
  const available = renderPracticeWorkspace(
    makePractice({
      capabilities: {
        playback: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        tempoChange: PRACTICE_CAPABILITY_STATES.AVAILABLE,
      },
      tempoBpm: 72,
    }),
  );
  assert.match(available, /value="72"/);

  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const html = renderPracticeWorkspace(
      makePractice({
        capabilities: {
          playback: PRACTICE_CAPABILITY_STATES.AVAILABLE,
          tempoChange: PRACTICE_CAPABILITY_STATES.AVAILABLE,
        },
        tempoBpm: value,
      }),
    );
    assert.doesNotMatch(html, /value="(?:0|-1|NaN|Infinity)"/);
  }
});

test("unavailable TAB and violin do not create empty sections", () => {
  const html = renderPracticeWorkspace(makePractice());

  assert.doesNotMatch(html, /<h2[^>]*>TAB<[/]h2>/);
  assert.doesNotMatch(html, /<h2[^>]*>Keman<[/]h2>/);
});

test("dynamic title is escaped and internal identifiers are not rendered", () => {
  const html = renderPracticeWorkspace(
    makePractice({
      title: '<img src=x onerror="alert(1)">',
    }),
  );

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(
    html,
    /pub-1|pkg-1|student-a|recipientStudentId|debug|internal secret/,
  );
});

test("missing capability object fails closed to unavailable presentation", () => {
  const html = renderPracticeWorkspace({
    title: "Eski güvenli görünüm",
    practice: { tempoBpm: 80 },
  });

  assert.match(html, /Nota görünümü bu çalışma için kullanılamıyor/);
  assert.match(html, /Dinleme bu çalışma için kullanılamıyor/);
  assert.doesNotMatch(html, /data-action="play-practice"/);
});
