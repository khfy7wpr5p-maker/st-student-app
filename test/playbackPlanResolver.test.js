import test from "node:test";
import assert from "node:assert/strict";

import { PLAYBACK_QUALITIES } from "../src/playback/playbackPlan.js";
import { createPlaybackPlanResolver } from "../src/playback/playbackPlanResolver.js";

function pkg(overrides = {}) {
  return {
    packageId: "pkg-a",
    content: {
      score: { format: "musicxml", data: "<score-partwise/>" },
      canonicalEvents: [],
    },
    ...overrides,
  };
}

function plan(quality, overrides = {}) {
  return {
    schemaVersion: 1,
    quality,
    packageId: "pkg-a",
    referenceTempoBpm: 120,
    tempoMap: [{ beat: 0, bpm: 120 }],
    measures: [{ index: 0, startBeat: 0, endBeat: 1 }],
    notes: [{
      startBeat: 0,
      durationBeats: 1,
      midi: 60,
      measureIndex: 0,
      partId: "P1",
      voice: "1",
    }],
    ...overrides,
  };
}

test("valid trusted FULL plan wins without approximate compilation", () => {
  let approximateCalls = 0;
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.FULL);
      },
    },
    approximateCompiler() {
      approximateCalls += 1;
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  const result = resolver.resolvePackage(pkg());

  assert.equal(result.quality, PLAYBACK_QUALITIES.FULL);
  assert.equal(approximateCalls, 0);
});

test("explicit trusted null falls back to APPROXIMATE", () => {
  let approximateCalls = 0;
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return null;
      },
    },
    approximateCompiler() {
      approximateCalls += 1;
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  const result = resolver.resolvePackage(pkg());

  assert.equal(result.quality, PLAYBACK_QUALITIES.APPROXIMATE);
  assert.equal(approximateCalls, 1);
});

test("trusted non-FULL output fails closed without approximate fallback", () => {
  let approximateCalls = 0;
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.APPROXIMATE);
      },
    },
    approximateCompiler() {
      approximateCalls += 1;
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  assert.equal(resolver.resolvePackage(pkg()), null);
  assert.equal(approximateCalls, 0);
});

test("invalid non-null trusted output fails closed without fallback", () => {
  let approximateCalls = 0;
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.FULL, { packageId: "other" });
      },
    },
    approximateCompiler() {
      approximateCalls += 1;
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  assert.equal(resolver.resolvePackage(pkg()), null);
  assert.equal(approximateCalls, 0);
});

test("trusted provider exception fails closed without fallback", () => {
  let approximateCalls = 0;
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        throw new Error("trusted backend secret");
      },
    },
    approximateCompiler() {
      approximateCalls += 1;
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  assert.equal(resolver.resolvePackage(pkg()), null);
  assert.equal(approximateCalls, 0);
});

test("no trusted provider uses approximate compiler", () => {
  const resolver = createPlaybackPlanResolver({
    approximateCompiler() {
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  assert.equal(
    resolver.resolvePackage(pkg()).quality,
    PLAYBACK_QUALITIES.APPROXIMATE,
  );
});

test("approximate null remains unavailable", () => {
  const resolver = createPlaybackPlanResolver({
    approximateCompiler() {
      return null;
    },
  });

  assert.equal(resolver.resolvePackage(pkg()), null);
});

test("canonicalEvents alone never enable playback", () => {
  const resolver = createPlaybackPlanResolver({
    approximateCompiler(received) {
      assert.deepEqual(received.content.canonicalEvents, [{
        onset: 0,
        duration: 99,
        midi: 127,
      }]);
      return null;
    },
  });

  assert.equal(
    resolver.resolvePackage(
      pkg({
        content: {
          score: { format: "musicxml", data: "<score-partwise/>" },
          canonicalEvents: [{ onset: 0, duration: 99, midi: 127 }],
        },
      }),
    ),
    null,
  );
});


test("approximate context carries exact SCORE timing provenance without changing the plan", () => {
  const musicXml = "<score-partwise version=\\"4.0\\"/>";
  const sourcePackage = pkg({
    content: {
      score: { format: "musicxml", data: musicXml },
      canonicalEvents: [],
    },
  });
  const resolver = createPlaybackPlanResolver({
    approximateCompiler(received) {
      assert.equal(received, sourcePackage);
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  const context = resolver.resolvePackageContext(sourcePackage);

  assert.equal(context.plan.quality, PLAYBACK_QUALITIES.APPROXIMATE);
  assert.deepEqual(context.timingProvenance, {
    kind: "EXACT_SCORE_SOURCE",
    musicXml,
  });
  assert.equal("timingProvenance" in context.plan, false);
});

test("valid trusted FULL plan stays playable without provenance authority", () => {
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.FULL);
      },
    },
  });

  const context = resolver.resolvePackageContext(pkg());

  assert.equal(context.plan.quality, PLAYBACK_QUALITIES.FULL);
  assert.equal(context.timingProvenance, null);
});

test("FULL quality and packageId equality alone never manufacture provenance", () => {
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.FULL, { packageId: "pkg-a" });
      },
    },
  });

  assert.deepEqual(resolver.resolvePackageContext(pkg()).timingProvenance, null);
});

test("mismatched trusted timing provenance is rejected while FULL playback remains valid", () => {
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.FULL);
      },
      resolveTrustedProvenance() {
        return {
          kind: "EXACT_SCORE_SOURCE",
          musicXml: "<score-partwise>OTHER</score-partwise>",
        };
      },
    },
  });

  const context = resolver.resolvePackageContext(pkg());

  assert.equal(context.plan.quality, PLAYBACK_QUALITIES.FULL);
  assert.equal(context.timingProvenance, null);
});

test("trusted timing provenance is accepted only for the exact package SCORE source", () => {
  const sourcePackage = pkg();
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.FULL);
      },
      resolveTrustedProvenance(receivedPackage, receivedPlan) {
        assert.equal(receivedPackage, sourcePackage);
        assert.equal(receivedPlan.quality, PLAYBACK_QUALITIES.FULL);
        return {
          kind: "EXACT_SCORE_SOURCE",
          musicXml: sourcePackage.content.score.data,
        };
      },
    },
  });

  assert.deepEqual(
    resolver.resolvePackageContext(sourcePackage).timingProvenance,
    {
      kind: "EXACT_SCORE_SOURCE",
      musicXml: sourcePackage.content.score.data,
    },
  );
});

test("trusted provenance failure disables highlight provenance without disabling FULL playback", () => {
  const resolver = createPlaybackPlanResolver({
    trustedTimingProvider: {
      resolveTrustedPlan() {
        return plan(PLAYBACK_QUALITIES.FULL);
      },
      resolveTrustedProvenance() {
        throw new Error("trusted provenance secret");
      },
    },
  });

  const context = resolver.resolvePackageContext(pkg());

  assert.equal(context.plan.quality, PLAYBACK_QUALITIES.FULL);
  assert.equal(context.timingProvenance, null);
});

test("resolvePackage remains backward compatible with resolvePackageContext plan", () => {
  const resolver = createPlaybackPlanResolver({
    approximateCompiler() {
      return plan(PLAYBACK_QUALITIES.APPROXIMATE);
    },
  });

  const legacy = resolver.resolvePackage(pkg());
  const context = resolver.resolvePackageContext(pkg());

  assert.deepEqual(legacy, context.plan);
  assert.deepEqual(Object.keys(legacy).sort(), [
    "measures",
    "notes",
    "packageId",
    "quality",
    "referenceTempoBpm",
    "schemaVersion",
    "tempoMap",
  ]);
});
