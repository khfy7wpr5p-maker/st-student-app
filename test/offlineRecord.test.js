import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFLINE_ACCESS_STATES,
  createOfflineRecord,
} from "../src/offline/offlineRecord.js";
import { makePublicDelivery } from "./support/practiceFixtures.js";

test("offline record snapshots one authorized student delivery", () => {
  const record = createOfflineRecord({
    studentId: "student-a",
    deliveryItem: makePublicDelivery(),
    cachedAt: "2026-09-21T12:00:00Z",
    lastVerifiedAt: "2026-09-21T12:00:00Z",
    accessState: OFFLINE_ACCESS_STATES.ACTIVE,
  });

  assert.equal(record.studentId, "student-a");
  assert.equal(record.publicationId, "pub-a");
  assert.equal(record.packageId, "pkg-a");
  assert.equal(record.scope, "public_pool");
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.package), true);
});

test("offline record rejects private package for another student", () => {
  const deliveryItem = makePublicDelivery();
  deliveryItem.package.publication = {
    scope: "student_private",
    recipientStudentId: "student-b",
  };
  deliveryItem.publication = {
    ...deliveryItem.publication,
    scope: "student_private",
    recipientStudentId: "student-b",
  };

  assert.throws(
    () =>
      createOfflineRecord({
        studentId: "student-a",
        deliveryItem,
        cachedAt: "2026-09-21T12:00:00Z",
        lastVerifiedAt: "2026-09-21T12:00:00Z",
        accessState: OFFLINE_ACCESS_STATES.ACTIVE,
      }),
    /student/i,
  );
});
