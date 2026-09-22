import test from "node:test";
import assert from "node:assert/strict";

import {
  PRACTICE_CAPABILITY_STATES,
} from "../src/practice/practiceCapabilities.js";
import {
  createPracticeWorkspace,
  withNotationCapability,
  withPracticeCapability,
  withPracticeMeasureRepeatEnabled,
  withPracticeTempo,
} from "../src/practice/practiceWorkspace.js";

function makeDeliveryItem() {
  return {
    publication: {
      publicationId: "pub-1",
      packageId: "pkg-1",
      scope: "public_pool",
      publishedAt: "2026-09-21T12:00:00Z",
      revokedAt: null,
    },
    package: {
      schemaVersion: "1.0.0",
      packageId: "pkg-1",
      workId: "work-1",
      title: "Etüt 1",
      approvedRevision: {
        revisionId: "R1",
        state: "teacher_approved",
        approvedAt: "2026-09-21T11:00:00Z",
      },
      publication: {
        scope: "public_pool",
      },
      content: {
        score: {
          format: "musicxml",
          data: "<score-partwise>SAFE RENDER INPUT</score-partwise>",
        },
        canonicalEvents: [{ unknown: "shape" }],
        guitarTab: { unknown: true },
        violin: { unknown: true },
      },
      practice: {
        tempoBpm: 80,
        allowTempoChange: true,
        allowMeasureRepeat: true,
        ttsLanguage: "tr-TR",
      },
    },
  };
}

test("workspace keeps MusicXML out of the student view model", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
  });

  assert.equal(result.viewModel.title, "Etüt 1");
  assert.equal("musicXml" in result.viewModel, false);
  assert.equal(JSON.stringify(result.viewModel).includes("score-partwise"), false);
  assert.deepEqual(result.renderSource, {
    kind: "musicxml",
    musicXml: "<score-partwise>SAFE RENDER INPUT</score-partwise>",
    sourceId: "pkg-1",
  });
});

test("workspace view model excludes publication and approval internals", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
  });

  const serialized = JSON.stringify(result.viewModel);
  assert.equal(serialized.includes("approvedRevision"), false);
  assert.equal(serialized.includes("recipientStudentId"), false);
  assert.equal("publication" in result.viewModel, false);
  assert.equal(serialized.includes("publishedAt"), false);
  assert.equal(serialized.includes("revokedAt"), false);
  assert.equal(serialized.includes("canonicalEvents"), false);
  assert.equal(serialized.includes('"unknown"'), false);
  assert.equal(
    result.viewModel.capabilities.guitarTab,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
  assert.equal(
    result.viewModel.capabilities.violin,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
});

test("workspace snapshot and render source are immutable", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.viewModel), true);
  assert.equal(Object.isFrozen(result.viewModel.capabilities), true);
  assert.equal(Object.isFrozen(result.viewModel.practice), true);
  assert.equal(Object.isFrozen(result.renderSource), true);
});

test("notation capability can change without changing independent capability state", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
  });

  const next = withNotationCapability(
    result.viewModel,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );

  assert.equal(next.capabilities.notation, PRACTICE_CAPABILITY_STATES.ERROR);
  assert.equal(
    next.capabilities.playback,
    result.viewModel.capabilities.playback,
  );
  assert.equal(
    next.capabilities.guitarTab,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
});

test("tempo metadata is normalized to a positive finite number or null", () => {
  const valid = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: false,
  });
  assert.equal(valid.viewModel.practice.tempoBpm, 80);

  const item = makeDeliveryItem();
  item.package.practice.tempoBpm = Number.NaN;
  const invalid = createPracticeWorkspace({
    deliveryItem: item,
    notationRuntimeAvailable: false,
  });
  assert.equal(invalid.viewModel.practice.tempoBpm, null);
});


test("generic capability update changes only the targeted capability", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
  });

  const next = withPracticeCapability(
    result.viewModel,
    "playback",
    PRACTICE_CAPABILITY_STATES.ERROR,
  );

  assert.equal(next.capabilities.playback, PRACTICE_CAPABILITY_STATES.ERROR);
  assert.equal(
    next.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
  assert.equal(
    next.capabilities.tempoChange,
    result.viewModel.capabilities.tempoChange,
  );
  assert.equal(Object.isFrozen(next), true);
  assert.equal(Object.isFrozen(next.capabilities), true);
});

test("generic capability update rejects unknown capability names", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
  });

  assert.throws(
    () =>
      withPracticeCapability(
        result.viewModel,
        "teacherApproval",
        PRACTICE_CAPABILITY_STATES.ERROR,
      ),
    /unsupported practice capability/,
  );
});


function makeWorkspacePlaybackPort({
  playable = true,
  quality = "APPROXIMATE",
  referenceTempo = 96,
} = {}) {
  return {
    canPlayPackage: () => playable,
    playPackage() {},
    pausePackage() {},
    restartPackage() {},
    canChangeTempoForPackage: () => playable,
    setTempoForPackage() {},
    canRepeatMeasureForPackage: () => playable,
    setMeasureRepeatEnabledForPackage() {},
    getPlaybackQualityForPackage: () => quality,
    getReferenceTempoForPackage: () => referenceTempo,
  };
}

test("workspace projects only safe playback quality, reference tempo, and repeat state", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
    playbackPort: makeWorkspacePlaybackPort(),
  });

  assert.equal(result.viewModel.playbackQuality, "APPROXIMATE");
  assert.equal(result.viewModel.practice.tempoBpm, 96);
  assert.equal(result.viewModel.practice.measureRepeatEnabled, false);
  assert.equal(JSON.stringify(result.viewModel).includes("SAFE RENDER INPUT"), false);
  assert.equal(JSON.stringify(result.viewModel).includes("canonicalEvents"), false);
});

test("workspace drops unknown playback quality and provider tempo when playback is unavailable", () => {
  const unknown = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: false,
    playbackPort: makeWorkspacePlaybackPort({ quality: "CERTAIN" }),
  });
  assert.equal(unknown.viewModel.playbackQuality, null);

  const unavailable = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: false,
    playbackPort: makeWorkspacePlaybackPort({
      playable: false,
      referenceTempo: 110,
    }),
  });
  assert.equal(unavailable.viewModel.playbackQuality, null);
  assert.equal(unavailable.viewModel.practice.tempoBpm, 80);
});

test("safe practice helpers update frozen UI state without mutating previous snapshot", () => {
  const result = createPracticeWorkspace({
    deliveryItem: makeDeliveryItem(),
    notationRuntimeAvailable: true,
    playbackPort: makeWorkspacePlaybackPort(),
  });
  const original = result.viewModel;

  const tempo = withPracticeTempo(original, 60);
  const repeat = withPracticeMeasureRepeatEnabled(tempo, true);

  assert.equal(original.practice.tempoBpm, 96);
  assert.equal(original.practice.measureRepeatEnabled, false);
  assert.equal(tempo.practice.tempoBpm, 60);
  assert.equal(repeat.practice.measureRepeatEnabled, true);
  assert.equal(Object.isFrozen(repeat), true);
  assert.equal(Object.isFrozen(repeat.practice), true);
});
