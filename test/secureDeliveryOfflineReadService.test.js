import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import {
  CONNECTIVITY_STATES,
} from "../src/offline/connectivityPort.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../src/offline/secureDeliveryOfflineReadService.js";
import {
  createSecureDeliveryStatusService,
} from "../src/offline/secureDeliveryStatusService.js";
import {
  SecureDeliveryApiError,
} from "../src/providers/secureDelivery/secureDeliveryApiClient.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";

const studentA = createStudentSession({
  studentId: "firebase-uid-a",
});
const studentB = createStudentSession({
  studentId: "firebase-uid-b",
});

function assignmentView(
  assignmentId = "assignment-a",
  state = "ACTIVE",
) {
  return Object.freeze({
    assignmentId,
    title: "Gitar Etüdü",
    practiceType: "SCORE",
    teacherNote: "Yavaş çalış.",
    state,
    assignedAt: "2026-09-23T10:00:00Z",
    sourceRef: Object.freeze({
      sourceKind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
  });
}

function practiceItem(
  assignmentId = "assignment-a",
) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: assignmentId,
    }),
    practiceType: "SCORE",
    package: makeApprovedPracticePackage({
      packageId: "pkg-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  });
}

function mutableConnectivity(
  initial = CONNECTIVITY_STATES.ONLINE,
) {
  let state = initial;
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(next) {
      state = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
}

test("Secure Delivery offline wrapper caches SCORE and keeps assignment metadata scoped to current local UID", async () => {
  const offlineRepository =
    createInMemoryOfflineRepository();
  const connectivityPort =
    mutableConnectivity();
  const calls = [];
  const onlineReadService = {
    async listPoolItems() {
      return [];
    },
    async getPoolItem() {
      throw new Error("unused");
    },
    async listAssignments() {
      calls.push("list");
      return [assignmentView()];
    },
    async getAssignment({
      assignmentId,
    }) {
      calls.push("get");
      return assignmentView(
        assignmentId,
      );
    },
    async getScorePracticeItem({
      assignmentId,
    }) {
      calls.push("practice");
      return practiceItem(
        assignmentId,
      );
    },
    async getChordBoardPracticeItem() {
      throw new Error("unused");
    },
  };

  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService,
      offlineRepository,
      connectivityPort,
      clock: () =>
        "2026-09-23T12:00:00Z",
    });

  await service.listAssignments({
    session: studentA,
    state: "ACTIVE",
  });

  const online =
    await service.getScorePracticeItem({
      session: studentA,
      assignmentId: "assignment-a",
    });

  assert.deepEqual(
    online.offlineAvailability,
    {
      source: "online",
      deviceAvailable: true,
      saveFailed: false,
    },
  );

  connectivityPort.setState(
    CONNECTIVITY_STATES.OFFLINE,
  );

  assert.equal(
    (
      await service.getAssignment({
        session: studentA,
        assignmentId: "assignment-a",
      })
    ).assignmentId,
    "assignment-a",
  );

  const offline =
    await service.getScorePracticeItem({
      session: studentA,
      assignmentId: "assignment-a",
    });

  assert.equal(
    offline.offlineAvailability.source,
    "offline",
  );
  assert.equal(
    offline.package.packageId,
    "pkg-a",
  );

  await assert.rejects(
    () =>
      service.getAssignment({
        session: studentB,
        assignmentId: "assignment-a",
      }),
    /offline assignment metadata unavailable/i,
  );

  await assert.rejects(
    () =>
      service.getScorePracticeItem({
        session: studentB,
        assignmentId: "assignment-a",
      }),
    /offline practice unavailable/i,
  );

  assert.deepEqual(
    calls,
    ["list", "practice"],
  );
});

test("cold offline wrapper never invents assignment metadata", async () => {
  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService: {
        async listPoolItems() {
          throw new Error(
            "online must not run",
          );
        },
        async getPoolItem() {
          throw new Error(
            "online must not run",
          );
        },
        async listAssignments() {
          throw new Error(
            "online must not run",
          );
        },
        async getAssignment() {
          throw new Error(
            "online must not run",
          );
        },
        async getScorePracticeItem() {
          throw new Error(
            "online must not run",
          );
        },
        async getChordBoardPracticeItem() {
          throw new Error(
            "online must not run",
          );
        },
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
      service.getAssignment({
        session: studentA,
        assignmentId: "assignment-a",
      }),
    /offline assignment metadata unavailable/i,
  );

  await assert.rejects(
    () =>
      service.listPoolItems({
        session: studentA,
      }),
    /Pool unavailable offline/i,
  );
});

test("Secure Delivery status maps exact 404 to REVOKED and preserves transient failures", async () => {
  const active =
    createSecureDeliveryStatusService({
      apiClient: {
        async getStudentAssignment(
          deliveryId,
        ) {
          assert.equal(
            deliveryId,
            "assignment-a",
          );
          return {
            deliveryId,
            assignmentId: deliveryId,
            packageId: "pkg-a",
            practiceType: "SCORE",
            teacherNote: "",
            state: "ACTIVE",
            assignedAt:
              "2026-09-23T10:00:00Z",
            deliveredAt:
              "2026-09-23T10:01:00Z",
            package:
              makeApprovedPracticePackage({
                packageId: "pkg-a",
                scope:
                  "student_private",
                recipientStudentId:
                  "server-student-a",
              }),
          };
        },
      },
    });

  assert.deepEqual(
    await active.getAccessStatus({
      accessRef: {
        kind: "SECURE_DELIVERY",
        deliveryId: "assignment-a",
      },
    }),
    {
      state: "ACTIVE",
      packageId: "pkg-a",
    },
  );

  const revoked =
    createSecureDeliveryStatusService({
      apiClient: {
        async getStudentAssignment() {
          throw new SecureDeliveryApiError({
            status: 404,
            code: "NOT_FOUND",
            message:
              "Secure Delivery request failed",
          });
        },
      },
    });

  assert.deepEqual(
    await revoked.getAccessStatus({
      accessRef: {
        kind: "SECURE_DELIVERY",
        deliveryId: "assignment-a",
      },
    }),
    { state: "REVOKED" },
  );

  const transient =
    createSecureDeliveryStatusService({
      apiClient: {
        async getStudentAssignment() {
          throw new SecureDeliveryApiError({
            status: 503,
            code:
              "SECURE_DELIVERY_UNAVAILABLE",
            message:
              "Secure Delivery request failed",
          });
        },
      },
    });

  await assert.rejects(
    () =>
      transient.getAccessStatus({
        accessRef: {
          kind: "SECURE_DELIVERY",
          deliveryId: "assignment-a",
        },
      }),
    /Secure Delivery request failed/,
  );
});


function pieceView(
  pieceAssignmentId = "piece-a",
) {
  return Object.freeze({
    schemaVersion: "1.0.0",
    pieceAssignmentId,
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "",
    state: "ACTIVE",
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: Object.freeze({
      scoreAssignmentId: "assignment-a",
      chordAssignmentIds: Object.freeze([]),
    }),
  });
}

test("warm offline Piece uses cached manifest and SCORE package only for current local UID", async () => {
  const offlineRepository =
    createInMemoryOfflineRepository();
  const connectivityPort =
    mutableConnectivity();
  const calls = [];

  const onlineReadService = {
    async listPoolItems() {
      return [];
    },
    async getPoolItem() {
      throw new Error("unused");
    },
    async listAssignments() {
      return [];
    },
    async getAssignment() {
      throw new Error("unused");
    },
    async getScorePracticeItem({
      assignmentId,
    }) {
      return practiceItem(
        assignmentId,
      );
    },
    async getChordBoardPracticeItem() {
      throw new Error("unused");
    },
    async listPieces() {
      calls.push("piece-list");
      return [pieceView()];
    },
    async getPiece({
      pieceAssignmentId,
    }) {
      calls.push("piece-get");
      return pieceView(
        pieceAssignmentId,
      );
    },
    async getPieceScoreItem() {
      calls.push("piece-score");
      return practiceItem(
        "assignment-a",
      );
    },
    async listPieceChordItems() {
      return [];
    },
  };

  const service =
    createSecureDeliveryOfflineReadService({
      onlineReadService,
      offlineRepository,
      connectivityPort,
      clock: () =>
        "2026-09-24T09:00:00Z",
    });

  assert.equal(
    (
      await service.listPieces({
        session: studentA,
        state: "ACTIVE",
      })
    )[0].pieceAssignmentId,
    "piece-a",
  );

  const onlineScore =
    await service.getPieceScoreItem({
      session: studentA,
      pieceAssignmentId: "piece-a",
    });
  assert.equal(
    onlineScore.offlineAvailability
      .deviceAvailable,
    true,
  );

  connectivityPort.setState(
    CONNECTIVITY_STATES.OFFLINE,
  );

  assert.equal(
    (
      await service.getPiece({
        session: studentA,
        pieceAssignmentId: "piece-a",
      })
    ).pieceId,
    "work-a",
  );

  const offlineScore =
    await service.getPieceScoreItem({
      session: studentA,
      pieceAssignmentId: "piece-a",
    });
  assert.equal(
    offlineScore.offlineAvailability.source,
    "offline",
  );

  await assert.rejects(
    () =>
      service.getPiece({
        session: studentB,
        pieceAssignmentId: "piece-a",
      }),
    /offline Piece manifest unavailable/i,
  );

  assert.deepEqual(
    calls,
    ["piece-list", "piece-score"],
  );
});
