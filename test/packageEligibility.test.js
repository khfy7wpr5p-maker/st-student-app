import test from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_PACKAGE_SCOPES } from "../src/contracts/practicePackage.js";
import { assertPublishablePracticePackage } from "../src/sharing/packageEligibility.js";

function makePackage() {
  return {
    schemaVersion: "1.0.0",
    packageId: "pkg-001",
    workId: "work-001",
    title: "Etüt 1",
    approvedRevision: {
      revisionId: "R1",
      state: "teacher_approved",
      approvedAt: "2026-09-21T12:00:00Z",
    },
    publication: {
      scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
    },
    content: {
      score: {
        format: "musicxml",
        data: "<score-partwise version=\"4.0\"></score-partwise>",
      },
      canonicalEvents: [],
    },
  };
}

test("teacher-approved valid package is publishable", () => {
  const pkg = makePackage();
  assert.equal(assertPublishablePracticePackage(pkg), pkg);
});

test("teacher-corrected package is not publishable", () => {
  const pkg = makePackage();
  pkg.approvedRevision.state = "teacher_corrected";

  assert.throws(
    () => assertPublishablePracticePackage(pkg),
    /teacher_approved/,
  );
});

test("teacher-only or OMR metadata cannot cross sharing boundary", () => {
  const pkg = makePackage();
  pkg.omr = { provider: "audiveris" };

  assert.throws(
    () => assertPublishablePracticePackage(pkg),
    /unsupported top-level field: omr/,
  );
});
