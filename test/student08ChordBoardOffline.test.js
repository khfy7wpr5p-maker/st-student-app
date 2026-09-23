import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import {
  CONNECTIVITY_STATES,
} from "../src/offline/connectivityPort.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../src/offline/secureDeliveryOfflineReadService.js";
import {
  createSecureDeliveryStatusService,
} from "../src/offline/secureDeliveryStatusService.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";

const studentA = createStudentSession({
  studentId: "firebase-uid-a",
});
const studentB = createStudentSession({
  studentId: "firebase-uid-b",
});

function mutableConnectivity(
  initial = CONNECTIVITY_STATES.ONLINE,
) {
  let state = initial;

  return {
    getState() {
      return state;
    },
    setState(next) {
      state = next;
    },
  };
}

function chordPackage(
  assignmentId = "assignment-chord-a",
) {
  return {
    schemaVersion: "1.0.0",
    packageType: "CHORD_BOARD",
    packageId: assignmentId,
    title: "Am Akor Çalışması",
    assignmentAuthority: {
      assignmentId,
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
          barres: [],
          shape: "open",
          generated: false,
          curated: true,
        },
        provenance: {
          sourceRepository: "st-guitar-chord-board",
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
  };
}

function chordItem(
  assignmentId = "assignment-chord-a",
) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    practiceType:
      PRACTICE_TYPES.CHORD_BOARD,
    package: chordPackage(assignmentId),
  });
}

function scoreItem(
  assignmentId = "assignment-score-a",
) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    practiceType: PRACTICE_TYPES.SCORE,
    package: makeApprovedPracticePackage({
      packageId: "pkg-score-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  });
}

function onlineService() {
  return {
    async listPoolItems() {
      return [];
    },
    async getPoolItem() {
      throw new Error("unused");
    },
    async listAssignments() {
      return [];
    },
    async getAssignment({
      assignmentId,
    }) {
      return Object.freeze({
        assignmentId,
        title: "Am Akor Çalışması",
        practiceType:
          PRACTICE_TYPES.CHORD_BOARD,
        teacherNote: "60 BPM ile çalış.",
        state: "ACTIVE",
        assignedAt:
          "2026-09-23T10:00:00Z",
        sourceRef: Object.freeze({
          sourceKind: "SECURE_DELIVERY",
          deliveryId: assignmentId,
        }),
      });
    },
    async getScorePracticeItem({
      assignmentId,
    }) {
      return scoreItem(assignmentId);
    },
    async getChordBoardPracticeItem({
      assignmentId,
    }) {
      return chordItem(assignmentId);
    },
  };
}

test("online CHORD_BOARD caches and warm offline reopens for the same student", async () => {
  const connectivity =
    mutableConnectivity();
  const repository =
    createInMemoryOfflineRepository();
  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService:
        onlineService(),
      offlineRepository: repository,
      connectivityPort: connectivity,
      clock: () =>
        "2026-09-23T12:00:00Z",
    });

  const online =
    await service.getChordBoardPracticeItem({
      session: studentA,
      assignmentId:
        "assignment-chord-a",
    });

  assert.equal(
    online.practiceType,
    PRACTICE_TYPES.CHORD_BOARD,
  );
  assert.deepEqual(
    online.offlineAvailability,
    {
      source: "online",
      deviceAvailable: true,
      saveFailed: false,
    },
  );

  connectivity.setState(
    CONNECTIVITY_STATES.OFFLINE,
  );

  const offline =
    await service.getChordBoardPracticeItem({
      session: studentA,
      assignmentId:
        "assignment-chord-a",
    });

  assert.equal(
    offline.practiceType,
    PRACTICE_TYPES.CHORD_BOARD,
  );
  assert.equal(
    offline.package.packageType,
    "CHORD_BOARD",
  );
  assert.deepEqual(
    offline.offlineAvailability,
    {
      source: "offline",
      deviceAvailable: true,
      saveFailed: false,
    },
  );
});

test("offline CHORD_BOARD cache is scoped to the authenticated student", async () => {
  const connectivity =
    mutableConnectivity();
  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService:
        onlineService(),
      offlineRepository:
        createInMemoryOfflineRepository(),
      connectivityPort: connectivity,
    });

  await service.getChordBoardPracticeItem({
    session: studentA,
    assignmentId: "assignment-chord-a",
  });

  connectivity.setState(
    CONNECTIVITY_STATES.OFFLINE,
  );

  await assert.rejects(
    () =>
      service.getChordBoardPracticeItem({
        session: studentB,
        assignmentId:
          "assignment-chord-a",
      }),
    /offline practice unavailable/i,
  );
});

test("offline SCORE and CHORD_BOARD caches cannot satisfy the other practice type", async () => {
  const connectivity =
    mutableConnectivity();
  const repository =
    createInMemoryOfflineRepository();
  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService:
        onlineService(),
      offlineRepository: repository,
      connectivityPort: connectivity,
    });

  await service.getChordBoardPracticeItem({
    session: studentA,
    assignmentId: "assignment-chord-a",
  });
  await service.getScorePracticeItem({
    session: studentA,
    assignmentId: "assignment-score-a",
  });

  connectivity.setState(
    CONNECTIVITY_STATES.OFFLINE,
  );

  await assert.rejects(
    () =>
      service.getScorePracticeItem({
        session: studentA,
        assignmentId:
          "assignment-chord-a",
      }),
    /offline practice unavailable/i,
  );

  await assert.rejects(
    () =>
      service.getChordBoardPracticeItem({
        session: studentA,
        assignmentId:
          "assignment-score-a",
      }),
    /offline practice unavailable/i,
  );
});

test("online CHORD_BOARD remains usable when offline cache write fails", async () => {
  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService:
        onlineService(),
      offlineRepository: {
        async putAuthorized() {
          throw new Error(
            "indexeddb quota provider detail",
          );
        },
        async getActiveByAccessRef() {
          return null;
        },
      },
      connectivityPort:
        mutableConnectivity(),
    });

  const item =
    await service.getChordBoardPracticeItem({
      session: studentA,
      assignmentId:
        "assignment-chord-a",
    });

  assert.equal(
    item.package.packageType,
    "CHORD_BOARD",
  );
  assert.deepEqual(
    item.offlineAvailability,
    {
      source: "online",
      deviceAvailable: false,
      saveFailed: true,
    },
  );
  assert.equal(
    JSON.stringify(item).includes(
      "indexeddb quota",
    ),
    false,
  );
});

test("cold offline CHORD_BOARD never calls the network or invents data", async () => {
  let onlineCalls = 0;
  const onlineMustNotRun =
    async () => {
      onlineCalls += 1;
      throw new Error(
        "online must not run",
      );
    };

  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService: {
        listPoolItems: onlineMustNotRun,
        getPoolItem: onlineMustNotRun,
        listAssignments:
          onlineMustNotRun,
        getAssignment:
          onlineMustNotRun,
        getScorePracticeItem:
          onlineMustNotRun,
        getChordBoardPracticeItem:
          onlineMustNotRun,
      },
      offlineRepository:
        createInMemoryOfflineRepository(),
      connectivityPort:
        mutableConnectivity(
          CONNECTIVITY_STATES.OFFLINE,
        ),
    });

  await assert.rejects(
    () =>
      service.getChordBoardPracticeItem({
        session: studentA,
        assignmentId:
          "assignment-chord-a",
      }),
    /offline practice unavailable/i,
  );
  assert.equal(onlineCalls, 0);
});

test("Secure Delivery status accepts active CHORD_BOARD through the same revocation boundary", async () => {
  const service =
    createSecureDeliveryStatusService({
      apiClient: {
        async getStudentAssignment(
          deliveryId,
        ) {
          return {
            deliveryId,
            assignmentId: deliveryId,
            packageId: deliveryId,
            practiceType:
              PRACTICE_TYPES.CHORD_BOARD,
            teacherNote:
              "60 BPM ile çalış.",
            state: "ACTIVE",
            assignedAt:
              "2026-09-23T10:00:00Z",
            deliveredAt:
              "2026-09-23T10:01:00Z",
            package:
              chordPackage(deliveryId),
          };
        },
      },
    });

  assert.deepEqual(
    await service.getAccessStatus({
      accessRef: {
        kind: "SECURE_DELIVERY",
        deliveryId:
          "assignment-chord-a",
      },
    }),
    {
      state: "ACTIVE",
      packageId:
        "assignment-chord-a",
    },
  );
});
