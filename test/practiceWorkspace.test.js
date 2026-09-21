import test from "node:test";
import assert from "node:assert/strict";

import {
  PRACTICE_CAPABILITY_STATES,
} from "../src/practice/practiceCapabilities.js";
import {
  createPracticeWorkspace,
  withNotationCapability,
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
  assert.equal(serialized.includes("publication"), false);
  assert.equal(serialized.includes("canonicalEvents"), false);
  assert.equal(serialized.includes("guitarTab"), false);
  assert.equal(serialized.includes("violin"), false);
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
