import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";

const studentA = createStudentSession({
  studentId: "student-a",
});
const studentB = createStudentSession({
  studentId: "student-b",
});

function makeChordItem() {
  return {
    accessRef: {
      kind: "SECURE_DELIVERY",
      deliveryId: "assignment-chord-a",
    },
    practiceType: PRACTICE_TYPES.CHORD_BOARD,
    package: {
      schemaVersion: "1.0.0",
      packageType: "CHORD_BOARD",
      packageId: "assignment-chord-a",
      title: "Am Akor Çalışması",
      assignmentAuthority: {
        assignmentId: "assignment-chord-a",
        state: "teacher_assigned",
        assignedAt: "2026-09-23T10:00:00Z",
      },
      publication: {
        scope: "student_private",
        recipientStudentId: "server-student-a",
      },
      content: {
        chordBoard: {
          schemaVersion: 1,
          sourceKind: "chord_board_exact_voicing",
          chord: {
            canonicalSymbol: "Am",
            canonicalRoot: "A",
            quality: "minor",
            displayRoot: "A",
            displaySymbol: "Am",
          },
          voicing: {
            frets: [-1, 0, 2, 2, 1, 0],
            fingers: [-1, 0, 2, 3, 1, 0],
            barres: [
              {
                finger: 1,
                fret: 5,
                fromString: 6,
                toString: 1,
              },
            ],
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
        teacherNote: "60 BPM ile çalış.",
      },
    },
    offlineAvailability: {
      source: "online",
      deviceAvailable: true,
      saveFailed: false,
    },
  };
}

function makeLegacySharingService() {
  return {
    listPublicPool() {
      return [];
    },
    listMyWork() {
      return [];
    },
    getPracticeItem() {
      throw new Error("unused");
    },
  };
}

function makeService({
  chordItem = makeChordItem(),
} = {}) {
  const calls = [];

  return {
    calls,
    service: {
      listPoolItems() {
        return [];
      },
      getPoolItem() {
        throw new Error("unused");
      },
      listAssignments() {
        return [];
      },
      getAssignment({ assignmentId }) {
        calls.push(["getAssignment", assignmentId]);
        return {
          assignmentId,
          title: "Am Akor Çalışması",
          practiceType:
            PRACTICE_TYPES.CHORD_BOARD,
          teacherNote: "60 BPM ile çalış.",
          state: "ACTIVE",
          assignedAt:
            "2026-09-23T10:00:00Z",
        };
      },
      getScorePracticeItem({
        assignmentId,
      }) {
        calls.push([
          "getScorePracticeItem",
          assignmentId,
        ]);
        throw new Error(
          "SCORE path must not run",
        );
      },
      getChordBoardPracticeItem({
        assignmentId,
      }) {
        calls.push([
          "getChordBoardPracticeItem",
          assignmentId,
        ]);
        return chordItem;
      },
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("CHORD_BOARD assignment opens dedicated screen without SCORE Practice", () => {
  const { service, calls } =
    makeService();
  const playbackCalls = [];

  const controller =
    createStudentAppController({
      sharingService:
        makeLegacySharingService(),
      student08ReadService: service,
      initialSession: studentA,
      notationAdapter: {
        isAvailable: () => true,
      },
      playbackPort: {
        preparePackage(pkg) {
          playbackCalls.push(pkg.packageId);
          return true;
        },
      },
    });

  controller.openAssignment(
    "assignment-chord-a",
  );

  const state = controller.getState();

  assert.equal(
    state.screen,
    STUDENT_APP_SCREENS.CHORD_BOARD,
  );
  assert.equal(state.practice, null);
  assert.equal(
    state.chordBoard.chord.displaySymbol,
    "Am",
  );
  assert.deepEqual(
    state.chordBoard.strings.map(
      (item) => item.stringNumber,
    ),
    [6, 5, 4, 3, 2, 1],
  );
  assert.deepEqual(calls, [
    ["getAssignment", "assignment-chord-a"],
    [
      "getChordBoardPracticeItem",
      "assignment-chord-a",
    ],
  ]);

  controller.recoverActivePracticePlayback();
  assert.deepEqual(playbackCalls, []);
});

test("CHORD_BOARD controller state exposes no package provenance or recipient authority", () => {
  const { service } = makeService();
  const controller =
    createStudentAppController({
      sharingService:
        makeLegacySharingService(),
      student08ReadService: service,
      initialSession: studentA,
    });

  controller.openAssignment(
    "assignment-chord-a",
  );

  const serialized =
    JSON.stringify(controller.getState());

  for (const forbidden of [
    "sourceRepository",
    "sourceCommit",
    "catalogFingerprint",
    "voicingFingerprint",
    "recipientStudentId",
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      forbidden,
    );
  }

  assert.match(
    serialized,
    /60 BPM ile çalış\./,
  );
});

test("late CHORD_BOARD response from previous session is ignored", async () => {
  const item = deferred();
  const { service } = makeService({
    chordItem: item.promise,
  });

  const controller =
    createStudentAppController({
      sharingService:
        makeLegacySharingService(),
      student08ReadService: service,
      initialSession: studentA,
    });

  const opening =
    controller.openAssignment(
      "assignment-chord-a",
    );

  controller.attachSession(studentB);
  item.resolve(makeChordItem());

  await opening;

  assert.equal(
    controller.getState().screen,
    STUDENT_APP_SCREENS.HOME,
  );
  assert.equal(
    controller.getState().session.studentId,
    "student-b",
  );
  assert.equal(
    controller.getState().chordBoard,
    null,
  );
});

test("sign out clears active CHORD_BOARD state", () => {
  const { service } = makeService();
  const controller =
    createStudentAppController({
      sharingService:
        makeLegacySharingService(),
      student08ReadService: service,
      initialSession: studentA,
    });

  controller.openAssignment(
    "assignment-chord-a",
  );
  assert.equal(
    controller.getState().screen,
    STUDENT_APP_SCREENS.CHORD_BOARD,
  );

  controller.signOut();

  assert.equal(
    controller.getState().screen,
    STUDENT_APP_SCREENS.SIGN_IN,
  );
  assert.equal(
    controller.getState().chordBoard,
    null,
  );
});
