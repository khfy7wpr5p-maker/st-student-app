import test from "node:test";
import assert from "node:assert/strict";

import {
  PRACTICE_PACKAGE_SCOPES,
  validatePracticePackage,
} from "../src/contracts/practicePackage.js";

function makePackage(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    packageId: "pkg-001",
    workId: "work-001",
    title: "Keman Etüdü 1",
    approvedRevision: {
      revisionId: "R17",
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
      guitarTab: null,
      violin: null,
    },
    practice: {
      tempoBpm: 80,
      allowTempoChange: true,
      allowMeasureRepeat: true,
      ttsLanguage: "tr-TR",
    },
    ...overrides,
  };
}

test("public pool teacher-approved package is valid", () => {
  const result = validatePracticePackage(makePackage());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("public pool package cannot carry a private student identifier", () => {
  const result = validatePracticePackage(
    makePackage({
      publication: {
        scope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        recipientStudentId: "student-040",
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /not allowed for public_pool/);
});

test("student-private package requires a recipient student id", () => {
  const result = validatePracticePackage(
    makePackage({
      publication: {
        scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /recipientStudentId/);
});

test("student-private package with recipient is valid", () => {
  const result = validatePracticePackage(
    makePackage({
      publication: {
        scope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
        recipientStudentId: "student-040",
      },
    }),
  );

  assert.equal(result.ok, true);
});

test("non-approved revision cannot become a practice package", () => {
  const pkg = makePackage();
  pkg.approvedRevision.state = "teacher_corrected";

  const result = validatePracticePackage(pkg);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /teacher_approved/);
});

test("teacher-only or OMR fields are rejected at package boundary", () => {
  const result = validatePracticePackage(
    makePackage({
      omr: { provider: "audiveris" },
    }),
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unsupported top-level field: omr/);
});

test("canonical event collection is required", () => {
  const pkg = makePackage();
  delete pkg.content.canonicalEvents;

  const result = validatePracticePackage(pkg);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /canonicalEvents/);
});


test("PracticePackage accepts exact guitar TAB MusicXML while legacy object shapes remain inert-compatible", () => {
  const valid = makePackage();
  valid.content.guitarTab = {
    format: "musicxml",
    data: "<score-partwise><part-list/></score-partwise>",
  };
  assert.equal(validatePracticePackage(valid).ok, true);

  const legacy = makePackage();
  legacy.content.guitarTab = { unknown: true };
  assert.equal(validatePracticePackage(legacy).ok, true);

  const invalid = makePackage();
  invalid.content.guitarTab = "ascii";
  const result = validatePracticePackage(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /guitarTab/i);
});
