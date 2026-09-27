import test from "node:test";
import assert from "node:assert/strict";

import {
  PRACTICE_CAPABILITY_STATES,
  derivePracticeCapabilities,
} from "../src/practice/practiceCapabilities.js";

const pkg = {
  content: {
    canonicalEvents: [{ any: "shape" }],
    guitarTab: { unknown: true },
    violin: { unknown: true },
  },
  practice: {
    tempoBpm: 80,
    allowTempoChange: true,
    allowMeasureRepeat: true,
  },
};

function makePlaybackPort() {
  return {
    canPlayPackage: () => true,
    playPackage() {},
    pausePackage() {},
    restartPackage() {},
    canChangeTempoForPackage: () => true,
    setTempoForPackage() {},
    canRepeatMeasureForPackage: () => true,
    setMeasureRepeatEnabledForPackage() {},
  };
}

test("unknown canonical events do not enable playback", () => {
  const result = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable: true,
    playbackPort: null,
  });

  assert.equal(result.notation, PRACTICE_CAPABILITY_STATES.AVAILABLE);
  assert.equal(result.playback, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.tempoChange, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.measureRepeat, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
});

test("undefined-shape guitar and violin objects remain unavailable", () => {
  const result = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable: true,
    playbackPort: null,
  });

  assert.equal(result.guitarTab, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.violin, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
});

test("trusted playback port enables only supported controls", () => {
  const result = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable: true,
    playbackPort: makePlaybackPort(),
  });

  assert.equal(result.playback, PRACTICE_CAPABILITY_STATES.AVAILABLE);
  assert.equal(result.tempoChange, PRACTICE_CAPABILITY_STATES.AVAILABLE);
  assert.equal(result.measureRepeat, PRACTICE_CAPABILITY_STATES.AVAILABLE);
});

test("teacher permission gates tempo and repeat without disabling playback", () => {
  const denied = derivePracticeCapabilities({
    pkg: {
      ...pkg,
      practice: {
        ...pkg.practice,
        allowTempoChange: false,
        allowMeasureRepeat: false,
      },
    },
    notationRuntimeAvailable: true,
    playbackPort: makePlaybackPort(),
  });

  assert.equal(denied.playback, PRACTICE_CAPABILITY_STATES.AVAILABLE);
  assert.equal(denied.tempoChange, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(denied.measureRepeat, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
});

test("missing control methods keep advertised playback capabilities unavailable", () => {
  const incomplete = {
    canPlayPackage: () => true,
    canChangeTempoForPackage: () => true,
    canRepeatMeasureForPackage: () => true,
  };

  const result = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable: true,
    playbackPort: incomplete,
  });

  assert.equal(result.playback, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.tempoChange, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.measureRepeat, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
});


test("validated guitar TAB MusicXML enables TAB only when notation runtime is available", () => {
  const tabPackage = {
    ...pkg,
    content: {
      ...pkg.content,
      guitarTab: {
        format: "musicxml",
        data: "<score-partwise><part-list/></score-partwise>",
      },
    },
  };

  assert.equal(
    derivePracticeCapabilities({
      pkg: tabPackage,
      notationRuntimeAvailable: true,
      playbackPort: null,
    }).guitarTab,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );

  assert.equal(
    derivePracticeCapabilities({
      pkg: tabPackage,
      notationRuntimeAvailable: false,
      playbackPort: null,
    }).guitarTab,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
});

function makeExactPlaybackPort(musicXml) {
  return {
    ...makePlaybackPort(),
    getScoreFollowPlaybackContextForPackage(work) {
      return {
        plan: { packageId: work.packageId, measures: [] },
        timingProvenance: {
          kind: "EXACT_SCORE_SOURCE",
          musicXml,
        },
      };
    },
  };
}

test("valid first-position violin descriptor is available only with exact score playback provenance", () => {
  const musicXml = "<score-partwise>VIOLIN SCORE</score-partwise>";
  const violinPackage = {
    ...pkg,
    packageId: "pkg-v",
    content: {
      ...pkg.content,
      score: { format: "musicxml", data: musicXml },
      violin: {
        schemaVersion: 1,
        targetPartId: "P1",
        position: 1,
        stringLengthMm: 328,
      },
    },
  };

  assert.equal(
    derivePracticeCapabilities({
      pkg: violinPackage,
      notationRuntimeAvailable: true,
      playbackPort: makeExactPlaybackPort(musicXml),
    }).violin,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );

  assert.equal(
    derivePracticeCapabilities({
      pkg: violinPackage,
      notationRuntimeAvailable: true,
      playbackPort: makePlaybackPort(),
    }).violin,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
});

test("invalid violin V1 descriptors remain unavailable", () => {
  const musicXml = "<score-partwise>VIOLIN SCORE</score-partwise>";
  const invalidDescriptors = [
    { schemaVersion: 1, position: 1 },
    { schemaVersion: 1, targetPartId: "P1", position: 2 },
    { schemaVersion: 1, targetPartId: "P1", position: 1, stringLengthMm: 249 },
    { schemaVersion: 1, targetPartId: "P1", position: 1, stringLengthMm: 401 },
    { schemaVersion: 1, targetPartId: "P1", position: 1, extra: true },
  ];

  for (const violin of invalidDescriptors) {
    const result = derivePracticeCapabilities({
      pkg: {
        ...pkg,
        packageId: "pkg-v",
        content: {
          ...pkg.content,
          score: { format: "musicxml", data: musicXml },
          violin,
        },
      },
      notationRuntimeAvailable: true,
      playbackPort: makeExactPlaybackPort(musicXml),
    });
    assert.equal(result.violin, PRACTICE_CAPABILITY_STATES.UNAVAILABLE);
  }
});

test("mismatched exact provenance cannot enable violin capability", () => {
  const musicXml = "<score-partwise>VIOLIN SCORE</score-partwise>";
  const violinPackage = {
    ...pkg,
    packageId: "pkg-v",
    content: {
      ...pkg.content,
      score: { format: "musicxml", data: musicXml },
      violin: { schemaVersion: 1, targetPartId: "P1", position: 1 },
    },
  };

  assert.equal(
    derivePracticeCapabilities({
      pkg: violinPackage,
      notationRuntimeAvailable: true,
      playbackPort: makeExactPlaybackPort("<score-partwise>OTHER</score-partwise>"),
    }).violin,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
});
