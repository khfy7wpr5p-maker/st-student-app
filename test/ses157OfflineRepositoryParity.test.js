import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";

import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import { createIndexedDbOfflineRepository } from "../src/offline/indexedDbOfflineRepository.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";
import {
  makeChordBoardPracticeItem,
} from "./support/chordBoardFixtures.js";

let sequence = 0;

const repositoryFactories = [
  [
    "in-memory",
    () => createInMemoryOfflineRepository(),
  ],
  [
    "IndexedDB",
    () =>
      createIndexedDbOfflineRepository({
        indexedDB,
        dbName:
          `ses157-parity-${sequence += 1}`,
      }),
  ],
];

const cachedAt = "2026-09-24T08:30:00Z";
const revokedAt = "2026-09-24T09:00:00Z";

function pieceManifest() {
  return Object.freeze({
    schemaVersion: "1.0.0",
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "Yavaş çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-24T08:00:00Z",
    contentRefs: Object.freeze({
      scoreAssignmentId: "assignment-score-a",
      chordAssignmentIds: Object.freeze([
        "assignment-chord-a",
        "assignment-chord-b",
      ]),
    }),
  });
}

function scorePracticeItem() {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: "assignment-score-a",
    }),
    practiceType: "SCORE",
    package: makeApprovedPracticePackage({
      packageId: "pkg-score-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  });
}

function accessRef(deliveryId) {
  return {
    kind: "SECURE_DELIVERY",
    deliveryId,
  };
}

async function seed(
  repository,
  { includeChordB = true } = {},
) {
  await repository.putPieceManifest({
    studentId: "student-a",
    piece: pieceManifest(),
    cachedAt,
    lastVerifiedAt: cachedAt,
  });

  const items = [
    scorePracticeItem(),
    makeChordBoardPracticeItem({
      assignmentId: "assignment-chord-a",
    }),
  ];

  if (includeChordB) {
    items.push(
      makeChordBoardPracticeItem({
        assignmentId: "assignment-chord-b",
      }),
    );
  }

  for (const practiceItem of items) {
    await repository.putAuthorized({
      studentId: "student-a",
      practiceItem,
      cachedAt,
      lastVerifiedAt: cachedAt,
    });
  }
}

async function revokeGraph(repository) {
  for (const deliveryId of [
    "assignment-score-a",
    "assignment-chord-a",
    "assignment-chord-b",
  ]) {
    await repository.markRevoked({
      studentId: "student-a",
      accessRef: accessRef(deliveryId),
      lastVerifiedAt: revokedAt,
    });
  }

  await repository.markPieceManifestRevoked({
    studentId: "student-a",
    pieceAssignmentId: "piece-a",
    lastVerifiedAt: revokedAt,
  });
}

for (const [name, createRepository] of repositoryFactories) {
  test(`SES-157 ${name} repository removes Piece and every cached child from active authority reads`, async () => {
    const repository = createRepository();
    await seed(repository);

    await revokeGraph(repository);

    assert.equal(
      await repository.getActivePieceManifest({
        studentId: "student-a",
        pieceAssignmentId: "piece-a",
      }),
      null,
    );

    for (const deliveryId of [
      "assignment-score-a",
      "assignment-chord-a",
      "assignment-chord-b",
    ]) {
      assert.equal(
        await repository.getActiveByAccessRef({
          studentId: "student-a",
          accessRef: accessRef(deliveryId),
        }),
        null,
      );
    }

    const stored =
      await repository.listAllForStudent({
        studentId: "student-a",
      });
    assert.equal(stored.length, 3);
    assert.equal(
      stored.every(
        (record) =>
          record.accessState === "REVOKED",
      ),
      true,
    );
  });

  test(`SES-157 ${name} repository tolerates an uncached child without creating authority`, async () => {
    const repository = createRepository();
    await seed(repository, {
      includeChordB: false,
    });

    assert.equal(
      await repository.getActiveByAccessRef({
        studentId: "student-a",
        accessRef: accessRef(
          "assignment-chord-b",
        ),
      }),
      null,
    );

    await revokeGraph(repository);

    assert.equal(
      await repository.getActivePieceManifest({
        studentId: "student-a",
        pieceAssignmentId: "piece-a",
      }),
      null,
    );
    assert.equal(
      await repository.getActiveByAccessRef({
        studentId: "student-a",
        accessRef: accessRef(
          "assignment-score-a",
        ),
      }),
      null,
    );
    assert.equal(
      await repository.getActiveByAccessRef({
        studentId: "student-a",
        accessRef: accessRef(
          "assignment-chord-a",
        ),
      }),
      null,
    );
    assert.equal(
      await repository.getActiveByAccessRef({
        studentId: "student-a",
        accessRef: accessRef(
          "assignment-chord-b",
        ),
      }),
      null,
    );

    const stored =
      await repository.listAllForStudent({
        studentId: "student-a",
      });
    assert.equal(stored.length, 2);
  });
}