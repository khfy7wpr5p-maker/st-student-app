import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  createSecureDeliveryStudent08ReadService,
} from "../src/sharing/secureDeliveryStudent08ReadService.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";

const studentA = createStudentSession({
  studentId: "firebase-uid-a",
});

function assignmentRow(
  assignmentId = "assignment-a",
  state = "ACTIVE",
) {
  return {
    deliveryId: assignmentId,
    assignmentId,
    packageId: `pkg-${assignmentId}`,
    practiceType: "SCORE",
    teacherNote: "Yavaş çalış.",
    state,
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeApprovedPracticePackage({
      packageId: `pkg-${assignmentId}`,
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  };
}

test("Secure Delivery Student08ReadPort maps sanitized Pool and lifecycle folders", async () => {
  const calls = [];
  const service = createSecureDeliveryStudent08ReadService({
    apiClient: {
      async listStudentPool() {
        calls.push(["pool"]);
        return [{
          poolItemId: "pool-a",
          title: "Duyuru",
          shortDescription: "",
          detailText: "Detay",
          publishedAt: "2026-09-23T10:00:00Z",
          audienceMode: "SELECTED",
        }];
      },
      async listStudentAssignments() {
        calls.push(["assignments"]);
        return [
          assignmentRow("assignment-a", "ACTIVE"),
          assignmentRow("assignment-b", "COMPLETED"),
        ];
      },
      async getStudentAssignment(deliveryId) {
        calls.push(["assignment", deliveryId]);
        return assignmentRow(deliveryId, "ACTIVE");
      },
    },
  });

  const pool = await service.listPoolItems({
    session: studentA,
  });
  assert.equal(pool[0].poolItemId, "pool-a");
  assert.equal("recipientStudentIds" in pool[0], false);

  const completed = await service.listAssignments({
    session: studentA,
    state: "COMPLETED",
  });
  assert.deepEqual(
    completed.map((item) => item.assignmentId),
    ["assignment-b"],
  );

  const practice =
    await service.getScorePracticeItem({
      session: studentA,
      assignmentId: "assignment-a",
    });
  assert.deepEqual(practice.accessRef, {
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  });
  assert.equal("publication" in practice, false);
  assert.equal(
    practice.package.packageId,
    "pkg-assignment-a",
  );
});

test("Secure Delivery Student08ReadPort rejects duplicate authority rows", async () => {
  const duplicatePool = createSecureDeliveryStudent08ReadService({
    apiClient: {
      async listStudentPool() {
        const row = {
          poolItemId: "pool-a",
          title: "Duyuru",
          shortDescription: "",
          detailText: "",
          publishedAt: "2026-09-23T10:00:00Z",
          audienceMode: "ALL",
        };
        return [row, row];
      },
      async listStudentAssignments() {
        return [];
      },
      async getStudentAssignment() {
        return assignmentRow();
      },
    },
  });

  await assert.rejects(
    () => duplicatePool.listPoolItems({ session: studentA }),
    /duplicate.*Pool/i,
  );

  const duplicateAssignments =
    createSecureDeliveryStudent08ReadService({
      apiClient: {
        async listStudentPool() {
          return [];
        },
        async listStudentAssignments() {
          return [
            assignmentRow("assignment-a"),
            assignmentRow("assignment-a"),
          ];
        },
        async getStudentAssignment() {
          return assignmentRow();
        },
      },
    });

  await assert.rejects(
    () =>
      duplicateAssignments.listAssignments({
        session: studentA,
      }),
    /duplicate.*assignment/i,
  );
});

test("Secure Delivery Student08ReadPort fails closed on exact assignment mismatch", async () => {
  const service = createSecureDeliveryStudent08ReadService({
    apiClient: {
      async listStudentPool() {
        return [];
      },
      async listStudentAssignments() {
        return [];
      },
      async getStudentAssignment() {
        return assignmentRow("assignment-other");
      },
    },
  });

  await assert.rejects(
    () =>
      service.getAssignment({
        session: studentA,
        assignmentId: "assignment-a",
      }),
    /identity mismatch/i,
  );

  await assert.rejects(
    () =>
      service.listAssignments({
        session: studentA,
        state: "UNKNOWN",
      }),
    /state filter/i,
  );
});
