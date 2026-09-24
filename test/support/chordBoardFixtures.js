export function makeChordBoardPackage({
  packageId = "assignment-chord-a",
  assignmentId = packageId,
  title = "Am Akor Çalışması",
  teacherNote = "60 BPM ile çalış.",
  recipientStudentId = "server-student-a",
  assignedAt = "2026-09-23T10:00:00Z",
  frets = [-1, 0, 2, 2, 1, 0],
  fingers = [-1, 0, 2, 3, 1, 0],
  barres = [],
} = {}) {
  return {
    schemaVersion: "1.0.0",
    packageType: "CHORD_BOARD",
    packageId,
    title,
    assignmentAuthority: {
      assignmentId,
      state: "teacher_assigned",
      assignedAt,
    },
    publication: {
      scope: "student_private",
      recipientStudentId,
    },
    content: {
      chordBoard: {
        schemaVersion: 1,
        sourceKind:
          "chord_board_exact_voicing",
        chord: {
          canonicalSymbol: "Am",
          canonicalRoot: "A",
          quality: "minor",
          displayRoot: "A",
          displaySymbol: "Am",
        },
        voicing: {
          frets: [...frets],
          fingers: [...fingers],
          barres: barres.map(
            (barre) => ({ ...barre }),
          ),
          shape: "open",
          generated: false,
          curated: true,
        },
        provenance: {
          sourceRepository:
            "st-guitar-chord-board",
          sourceCommit:
            "1111111111111111111111111111111111111111",
          catalogFingerprint:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        voicingFingerprint:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
    practice: {
      teacherNote,
    },
  };
}

export function makeChordBoardRow({
  assignmentId = "assignment-chord-a",
  title = "Am Akor Çalışması",
  teacherNote = "60 BPM ile çalış.",
  recipientStudentId = "server-student-a",
  assignedAt = "2026-09-23T10:00:00Z",
  deliveredAt = "2026-09-23T10:01:00Z",
  state = "ACTIVE",
  barres = [],
} = {}) {
  return {
    deliveryId: assignmentId,
    assignmentId,
    packageId: assignmentId,
    practiceType: "CHORD_BOARD",
    teacherNote,
    state,
    assignedAt,
    deliveredAt,
    package: makeChordBoardPackage({
      packageId: assignmentId,
      assignmentId,
      title,
      teacherNote,
      recipientStudentId,
      assignedAt,
      barres,
    }),
  };
}

export function makeChordBoardPracticeItem({
  assignmentId = "assignment-chord-a",
  title = "Am Akor Çalışması",
  teacherNote = "60 BPM ile çalış.",
  recipientStudentId = "server-student-a",
  assignedAt = "2026-09-23T10:00:00Z",
  barres = [],
} = {}) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    practiceType: "CHORD_BOARD",
    package: makeChordBoardPackage({
      packageId: assignmentId,
      assignmentId,
      title,
      teacherNote,
      recipientStudentId,
      assignedAt,
      barres,
    }),
  });
}
