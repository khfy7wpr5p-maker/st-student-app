const STUDENT_A_ID = "ses13-student-a";
const STUDENT_B_ID = "ses13-student-b";

export const SES13_STUDENT_A_EMAIL =
  "student-a@ses13.test";
export const SES13_STUDENT_A_PASSWORD =
  "ses13-password";
export const SES13_STUDENT_A_PIECE_TITLE =
  "SES-13 Öğrenci A Etüdü";
export const SES13_STUDENT_B_PIECE_TITLE =
  "SES-13 Öğrenci B Gizli Parçası";
export const SES13_RAW_XML_MARKER =
  "SES13_RAW_XML_PRIVATE_MARKER";
export const SES13_INTERNAL_PACKAGE_MARKER =
  "ses13-score-package-a";

const ASSIGNED_AT = "2026-09-25T08:00:00.000Z";
const APPROVED_AT = "2026-09-25T07:30:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const SCORE_XML_A =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<score-partwise version="3.1">' +
  '<!--SES13_RAW_XML_PRIVATE_MARKER-->' +
  '<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1"><attributes>' +
  '<divisions>1</divisions><key><fifths>0</fifths></key>' +
  '<time><beats>4</beats><beat-type>4</beat-type></time>' +
  '<clef><sign>G</sign><line>2</line></clef>' +
  '</attributes>' +
  '<direction placement="above"><direction-type><metronome>' +
  '<beat-unit>quarter</beat-unit><per-minute>60</per-minute>' +
  '</metronome></direction-type><sound tempo="60"/></direction>' +
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>' +
  '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>' +
  '<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>' +
  '<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>' +
  '</measure></part></score-partwise>';

const TAB_XML_A =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<score-partwise version="3.1">' +
  '<part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1"><attributes>' +
  '<divisions>1</divisions><key><fifths>0</fifths></key>' +
  '<time><beats>4</beats><beat-type>4</beat-type></time>' +
  '<staves>2</staves>' +
  '<clef number="1"><sign>G</sign><line>2</line></clef>' +
  '<clef number="2"><sign>TAB</sign><line>5</line></clef>' +
  '<staff-details number="2"><staff-lines>6</staff-lines>' +
  '<staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>' +
  '<staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>' +
  '<staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>' +
  '<staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>' +
  '<staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>' +
  '<staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>' +
  '</staff-details></attributes>' +
  '<note><pitch><step>B</step><octave>4</octave></pitch>' +
  '<duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>' +
  '<note><pitch><step>E</step><octave>5</octave></pitch>' +
  '<duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>' +
  '<backup><duration>4</duration></backup>' +
  '<note><pitch><step>B</step><octave>4</octave></pitch>' +
  '<duration>2</duration><voice>5</voice><type>half</type><staff>2</staff>' +
  '<notations><technical><string>1</string><fret>7</fret></technical></notations></note>' +
  '<note><pitch><step>E</step><octave>5</octave></pitch>' +
  '<duration>2</duration><voice>5</voice><type>half</type><staff>2</staff>' +
  '<notations><technical><string>1</string><fret>12</fret></technical></notations></note>' +
  '</measure></part></score-partwise>';

function scorePackage({
  studentId,
  packageId,
  workId,
  title,
  revisionId,
  scoreXml,
  tabXml,
}) {
  return Object.freeze({
    schemaVersion: "1.0.0",
    packageId,
    workId,
    title,
    approvedRevision: Object.freeze({
      revisionId,
      state: "teacher_approved",
      approvedAt: APPROVED_AT,
    }),
    publication: Object.freeze({
      scope: "student_private",
      recipientStudentId: studentId,
    }),
    content: Object.freeze({
      score: Object.freeze({
        format: "musicxml",
        data: scoreXml,
      }),
      guitarTab:
        tabXml === null
          ? null
          : Object.freeze({
              format: "musicxml",
              data: tabXml,
            }),
      canonicalEvents: Object.freeze([]),
    }),
    practice: Object.freeze({
      tempoBpm: 60,
      allowTempoChange: true,
      allowMeasureRepeat: true,
    }),
  });
}

function scoreItem({
  studentId,
  assignmentId,
  package: pkg,
}) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    practiceType: "SCORE",
    package: pkg,
    studentId,
  });
}

function chordPackage({
  studentId,
  assignmentId,
  title,
  fingerprint,
}) {
  return Object.freeze({
    schemaVersion: "1.0.0",
    packageType: "CHORD_BOARD",
    packageId: assignmentId,
    title,
    assignmentAuthority: Object.freeze({
      assignmentId,
      state: "teacher_assigned",
      assignedAt: ASSIGNED_AT,
    }),
    publication: Object.freeze({
      scope: "student_private",
      recipientStudentId: studentId,
    }),
    content: Object.freeze({
      chordBoard: Object.freeze({
        schemaVersion: 1,
        sourceKind:
          "chord_board_exact_voicing",
        chord: Object.freeze({
          canonicalSymbol: "C",
          canonicalRoot: "C",
          quality: "major",
          displayRoot: "C",
          displaySymbol: "C",
        }),
        voicing: Object.freeze({
          frets: Object.freeze([
            -1, 3, 2, 0, 1, 0,
          ]),
          fingers: Object.freeze([
            -1, 3, 2, 0, 1, 0,
          ]),
          barres: Object.freeze([]),
          shape: "x32010",
          generated: false,
          curated: true,
        }),
        provenance: Object.freeze({
          sourceRepository:
            "st-student-app/browser-tests",
          sourceCommit: "ses13-fixture",
          catalogFingerprint:
            fingerprint,
        }),
        voicingFingerprint:
          fingerprint,
      }),
    }),
    practice: Object.freeze({
      teacherNote:
        "C majör açık pozisyonu temiz çal.",
    }),
  });
}

function chordItem({
  studentId,
  assignmentId,
  package: pkg,
}) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    practiceType: "CHORD_BOARD",
    package: pkg,
    studentId,
  });
}

function piece({
  studentId,
  pieceAssignmentId,
  pieceId,
  arrangementId,
  title,
  scoreAssignmentId,
  chordAssignmentIds,
}) {
  return Object.freeze({
    schemaVersion: "1.0.0",
    pieceAssignmentId,
    pieceId,
    arrangementId,
    title,
    teacherNote:
      "Nota, TAB ve akor görünümünü birlikte çalış.",
    state: "ACTIVE",
    assignedAt: ASSIGNED_AT,
    contentRefs: Object.freeze({
      scoreAssignmentId,
      chordAssignmentIds:
        Object.freeze([
          ...chordAssignmentIds,
        ]),
    }),
    studentId,
  });
}

const SCORE_PACKAGE_A = scorePackage({
  studentId: STUDENT_A_ID,
  packageId:
    SES13_INTERNAL_PACKAGE_MARKER,
  workId: "ses13-work-a",
  title: SES13_STUDENT_A_PIECE_TITLE,
  revisionId: "ses13-revision-a",
  scoreXml: SCORE_XML_A,
  tabXml: TAB_XML_A,
});
const SCORE_ASSIGNMENT_A =
  "ses13-score-assignment-a";
const CHORD_ASSIGNMENT_A =
  "ses13-chord-assignment-a";
const PIECE_A = piece({
  studentId: STUDENT_A_ID,
  pieceAssignmentId:
    "ses13-piece-assignment-a",
  pieceId: "ses13-piece-a",
  arrangementId:
    "ses13-arrangement-a",
  title: SES13_STUDENT_A_PIECE_TITLE,
  scoreAssignmentId:
    SCORE_ASSIGNMENT_A,
  chordAssignmentIds: [
    CHORD_ASSIGNMENT_A,
  ],
});
const SCORE_ITEM_A = scoreItem({
  studentId: STUDENT_A_ID,
  assignmentId: SCORE_ASSIGNMENT_A,
  package: SCORE_PACKAGE_A,
});
const CHORD_PACKAGE_A = chordPackage({
  studentId: STUDENT_A_ID,
  assignmentId: CHORD_ASSIGNMENT_A,
  title: "C Majör",
  fingerprint: SHA_A,
});
const CHORD_ITEM_A = chordItem({
  studentId: STUDENT_A_ID,
  assignmentId: CHORD_ASSIGNMENT_A,
  package: CHORD_PACKAGE_A,
});

const SCORE_ASSIGNMENT_B =
  "ses13-score-assignment-b";
const SCORE_PACKAGE_B = scorePackage({
  studentId: STUDENT_B_ID,
  packageId: "ses13-score-package-b",
  workId: "ses13-work-b",
  title: SES13_STUDENT_B_PIECE_TITLE,
  revisionId: "ses13-revision-b",
  scoreXml: SCORE_XML_A.replace(
    SES13_RAW_XML_MARKER,
    "SES13_STUDENT_B_XML",
  ),
  tabXml: null,
});
const SCORE_ITEM_B = scoreItem({
  studentId: STUDENT_B_ID,
  assignmentId: SCORE_ASSIGNMENT_B,
  package: SCORE_PACKAGE_B,
});
const PIECE_B = piece({
  studentId: STUDENT_B_ID,
  pieceAssignmentId:
    "ses13-piece-assignment-b",
  pieceId: "ses13-piece-b",
  arrangementId:
    "ses13-arrangement-b",
  title: SES13_STUDENT_B_PIECE_TITLE,
  scoreAssignmentId:
    SCORE_ASSIGNMENT_B,
  chordAssignmentIds: [],
});

const DATA = Object.freeze({
  [STUDENT_A_ID]: Object.freeze({
    piece: PIECE_A,
    scoreItem: SCORE_ITEM_A,
    chordItems:
      Object.freeze([CHORD_ITEM_A]),
  }),
  [STUDENT_B_ID]: Object.freeze({
    piece: PIECE_B,
    scoreItem: SCORE_ITEM_B,
    chordItems: Object.freeze([]),
  }),
});

function requireStudent(session) {
  const studentId =
    session?.studentId;
  const data = DATA[studentId];

  if (data === undefined) {
    throw new Error(
      "SES-13 fixture student is unauthorized",
    );
  }

  return Object.freeze({
    studentId,
    data,
  });
}

function requireOnline() {
  if (globalThis.navigator?.onLine === false) {
    throw new Error(
      "SES-13 online provider called while offline",
    );
  }
}

function requirePiece(
  data,
  pieceAssignmentId,
) {
  if (
    data.piece.pieceAssignmentId !==
    pieceAssignmentId
  ) {
    throw new Error(
      "SES-13 fixture Piece unavailable",
    );
  }

  return data.piece;
}

function findPracticeItem(
  data,
  assignmentId,
) {
  if (
    data.scoreItem.accessRef.deliveryId ===
    assignmentId
  ) {
    return data.scoreItem;
  }

  return (
    data.chordItems.find(
      (item) =>
        item.accessRef.deliveryId ===
        assignmentId,
    ) ?? null
  );
}

export function createSes13OnlineReadService() {
  return Object.freeze({
    async listPoolItems() {
      requireOnline();
      return Object.freeze([]);
    },

    async getPoolItem() {
      requireOnline();
      throw new Error(
        "SES-13 fixture Pool item unavailable",
      );
    },

    async listAssignments() {
      requireOnline();
      return Object.freeze([]);
    },

    async getAssignment({
      session,
      assignmentId,
    } = {}) {
      requireOnline();
      const { data } =
        requireStudent(session);
      const item =
        findPracticeItem(
          data,
          assignmentId,
        );

      if (item === null) {
        throw new Error(
          "SES-13 fixture assignment unavailable",
        );
      }

      return Object.freeze({
        assignmentId,
        practiceType:
          item.practiceType,
        state: "ACTIVE",
        title: item.package.title,
        teacherNote:
          item.package.practice
            ?.teacherNote ?? "",
        assignedAt: ASSIGNED_AT,
      });
    },

    async getScorePracticeItem({
      session,
      assignmentId,
    } = {}) {
      requireOnline();
      const { data } =
        requireStudent(session);

      if (
        data.scoreItem.accessRef
          .deliveryId !== assignmentId
      ) {
        throw new Error(
          "SES-13 SCORE assignment unavailable",
        );
      }

      return data.scoreItem;
    },

    async getChordBoardPracticeItem({
      session,
      assignmentId,
    } = {}) {
      requireOnline();
      const { data } =
        requireStudent(session);
      const item =
        data.chordItems.find(
          (candidate) =>
            candidate.accessRef
              .deliveryId ===
            assignmentId,
        ) ?? null;

      if (item === null) {
        throw new Error(
          "SES-13 CHORD_BOARD assignment unavailable",
        );
      }

      return item;
    },

    async listPieces({
      session,
      state,
    } = {}) {
      requireOnline();
      const { data } =
        requireStudent(session);

      return Object.freeze(
        state === undefined ||
        data.piece.state === state
          ? [data.piece]
          : [],
      );
    },

    async getPiece({
      session,
      pieceAssignmentId,
    } = {}) {
      requireOnline();
      const { data } =
        requireStudent(session);
      return requirePiece(
        data,
        pieceAssignmentId,
      );
    },

    async getPieceScoreItem({
      session,
      pieceAssignmentId,
    } = {}) {
      requireOnline();
      const { data } =
        requireStudent(session);
      requirePiece(
        data,
        pieceAssignmentId,
      );
      return data.scoreItem;
    },

    async listPieceChordItems({
      session,
      pieceAssignmentId,
    } = {}) {
      requireOnline();
      const { data } =
        requireStudent(session);
      requirePiece(
        data,
        pieceAssignmentId,
      );
      return data.chordItems;
    },
  });
}

export function createSes13StatusServices() {
  const publicationStatusService =
    Object.freeze({
      async getPublicationStatus() {
        requireOnline();
        return Object.freeze({
          state: "REVOKED",
        });
      },
    });

  const secureDeliveryStatusService =
    Object.freeze({
      async getAccessStatus({
        session,
        accessRef,
      } = {}) {
        requireOnline();
        const { data } =
          requireStudent(session);
        const item =
          findPracticeItem(
            data,
            accessRef?.deliveryId,
          );

        if (item === null) {
          return Object.freeze({
            state: "REVOKED",
          });
        }

        return Object.freeze({
          state: "ACTIVE",
          packageId:
            item.package.packageId,
        });
      },

      async getPieceStatus({
        session,
        pieceAssignmentId,
      } = {}) {
        requireOnline();
        const { data } =
          requireStudent(session);
        const pieceValue =
          requirePiece(
            data,
            pieceAssignmentId,
          );

        return Object.freeze({
          state: "ACTIVE",
          piece: pieceValue,
        });
      },
    });

  return Object.freeze({
    publicationStatusService,
    secureDeliveryStatusService,
  });
}

export function ses13CredentialsMatch({
  email,
  password,
} = {}) {
  return (
    email === SES13_STUDENT_A_EMAIL &&
    password === SES13_STUDENT_A_PASSWORD
  );
}

export function ses13StudentAId() {
  return STUDENT_A_ID;
}
