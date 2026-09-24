import { createStudentSession } from "../../src/auth/session.js";

export const studentA = createStudentSession({ studentId: "student-a" });

export function makeApprovedPracticePackage({
  packageId = "pkg-a",
  workId = "work-a",
  title = "Etüt A",
  scope = "public_pool",
  recipientStudentId,
  guitarTabMusicXml = null,
} = {}) {
  return {
    schemaVersion: "1.0.0",
    packageId,
    workId,
    title,
    approvedRevision: {
      revisionId: `rev-${packageId}`,
      state: "teacher_approved",
      approvedAt: "2026-09-21T12:00:00Z",
    },
    publication:
      scope === "student_private"
        ? { scope, recipientStudentId }
        : { scope },
    content: {
      score: {
        format: "musicxml",
        data: "<score-partwise><part-list/></score-partwise>",
      },
      canonicalEvents: [],
      guitarTab:
        typeof guitarTabMusicXml === "string"
          ? {
              format: "musicxml",
              data: guitarTabMusicXml,
            }
          : null,
    },
    practice: {
      tempoBpm: 80,
      allowTempoChange: true,
      allowMeasureRepeat: true,
      ttsLanguage: "tr-TR",
    },
  };
}

export function makeDelivery(
  publicationId = "pub-a",
  packageId = "pkg-a",
  {
    scope = "public_pool",
    studentId = "student-a",
    title = "Etüt A",
  } = {},
) {
  const pkg = makeApprovedPracticePackage({
    packageId,
    title,
    scope,
    recipientStudentId:
      scope === "student_private" ? studentId : undefined,
  });

  return {
    publication: {
      publicationId,
      packageId,
      scope,
      ...(scope === "student_private"
        ? { recipientStudentId: studentId }
        : {}),
      publishedAt: "2026-09-21T12:00:00Z",
      revokedAt: null,
    },
    package: pkg,
  };
}

export const makePublicDelivery = () => makeDelivery("pub-a", "pkg-a");

export const makePrivateDelivery = (studentId = "student-a") =>
  makeDelivery("pub-private", "pkg-private", {
    scope: "student_private",
    studentId,
    title: "Özel Etüt",
  });

export function makePutArgs(
  studentId,
  deliveryItem,
  {
    cachedAt = "2026-09-21T12:00:00Z",
    lastVerifiedAt = "2026-09-21T12:00:00Z",
  } = {},
) {
  return { studentId, deliveryItem, cachedAt, lastVerifiedAt };
}
