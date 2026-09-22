import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";
import { dispatchStudentAppAction } from "../src/ui/shellActions.js";

const session = createStudentSession({ studentId: "student-a" });

function makeScoreDelivery() {
  return {
    publication: {
      publicationId: "pub-score",
      packageId: "pkg-score",
      scope: "student_private",
      recipientStudentId: "student-a",
      publishedAt: "2026-09-22T16:00:00Z",
      revokedAt: null,
    },
    package: {
      schemaVersion: "1.0.0",
      packageId: "pkg-score",
      workId: "work-score",
      title: "Gitar Etüdü",
      approvedRevision: {
        revisionId: "R1",
        state: "teacher_approved",
        approvedAt: "2026-09-22T15:00:00Z",
      },
      publication: {
        scope: "student_private",
        recipientStudentId: "student-a",
      },
      content: {
        score: {
          format: "musicxml",
          data: "<score-partwise><part-list/></score-partwise>",
        },
        canonicalEvents: [],
      },
      practice: {
        tempoBpm: 80,
        allowTempoChange: true,
        allowMeasureRepeat: true,
        ttsLanguage: "tr-TR",
      },
    },
  };
}

function makeStudent08Service() {
  const calls = [];
  return {
    calls,
    service: {
      listPoolItems() {
        calls.push(["listPoolItems"]);
        return [
          {
            poolItemId: "pool-1",
            title: "Duyuru",
            shortDescription: "Yeni çalışma",
            detailText: "Bu hafta yavaş çalış.",
            publishedAt: "2026-09-22T16:00:00Z",
            audienceMode: "ALL",
          },
        ];
      },
      getPoolItem({ poolItemId }) {
        calls.push(["getPoolItem", poolItemId]);
        return {
          poolItemId,
          title: "Duyuru",
          shortDescription: "Yeni çalışma",
          detailText: "Bu hafta yavaş çalış.",
          publishedAt: "2026-09-22T16:00:00Z",
          audienceMode: "ALL",
        };
      },
      listAssignments({ state }) {
        calls.push(["listAssignments", state]);
        if (state === ASSIGNMENT_STATES.COMPLETED) {
          return [
            {
              assignmentId: "assignment-done",
              title: "Bitmiş Etüt",
              practiceType: PRACTICE_TYPES.SCORE,
              teacherNote: "Tekrar et.",
              state,
              assignedAt: "2026-09-22T16:00:00Z",
              sourceRef: { publicationId: "pub-done" },
            },
          ];
        }

        return [
          {
            assignmentId: "assignment-score",
            title: "Gitar Etüdü",
            practiceType: PRACTICE_TYPES.SCORE,
            teacherNote: "İkinci ölçüyü yavaş çalış.",
            state: ASSIGNMENT_STATES.ACTIVE,
            assignedAt: "2026-09-22T16:00:00Z",
            sourceRef: { publicationId: "pub-score" },
          },
          {
            assignmentId: "assignment-chord",
            title: "Am",
            practiceType: PRACTICE_TYPES.CHORD_BOARD,
            teacherNote: "Parmakları sırayla yerleştir.",
            state: ASSIGNMENT_STATES.ACTIVE,
            assignedAt: "2026-09-22T16:05:00Z",
            snapshot: {
              displaySymbol: "Am",
              canonicalSymbol: "A:min",
              frets: [-1, 0, 2, 2, 1, 0],
            },
          },
        ];
      },
      getAssignment({ assignmentId }) {
        calls.push(["getAssignment", assignmentId]);
        if (assignmentId === "assignment-chord") {
          return {
            assignmentId,
            title: "Am",
            practiceType: PRACTICE_TYPES.CHORD_BOARD,
            teacherNote: "Parmakları sırayla yerleştir.",
            state: ASSIGNMENT_STATES.ACTIVE,
            assignedAt: "2026-09-22T16:05:00Z",
            snapshot: {
              displaySymbol: "Am",
              canonicalSymbol: "A:min",
              frets: [-1, 0, 2, 2, 1, 0],
            },
          };
        }

        return {
          assignmentId,
          title: "Gitar Etüdü",
          practiceType: PRACTICE_TYPES.SCORE,
          teacherNote: "İkinci ölçüyü yavaş çalış.",
          state: ASSIGNMENT_STATES.ACTIVE,
          assignedAt: "2026-09-22T16:00:00Z",
          sourceRef: { publicationId: "pub-score" },
        };
      },
      getScorePracticeItem({ assignmentId }) {
        calls.push(["getScorePracticeItem", assignmentId]);
        return makeScoreDelivery();
      },
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
      return makeScoreDelivery();
    },
  };
}

test("STUDENT-08 controller uses PoolItem read model and opens detail without Practice", () => {
  const { service, calls } = makeStudent08Service();
  const controller = createStudentAppController({
    sharingService: makeLegacySharingService(),
    student08ReadService: service,
    initialSession: session,
  });

  controller.showPublicPool();
  let state = controller.getState();

  assert.equal(state.student08, true);
  assert.equal(state.screen, STUDENT_APP_SCREENS.PUBLIC_POOL);
  assert.equal(state.items[0].poolItemId, "pool-1");
  assert.equal("publicationId" in state.items[0], false);

  controller.openPoolItem("pool-1");
  state = controller.getState();

  assert.equal(state.poolDetail.detailText, "Bu hafta yavaş çalış.");
  assert.equal(state.practice, null);
  assert.deepEqual(calls.slice(0, 2), [
    ["listPoolItems"],
    ["getPoolItem", "pool-1"],
  ]);
});

test("STUDENT-08 My Work filters exact teacher-owned lifecycle folders", () => {
  const { service } = makeStudent08Service();
  const controller = createStudentAppController({
    sharingService: makeLegacySharingService(),
    student08ReadService: service,
    initialSession: session,
  });

  controller.showMyWork();
  assert.equal(controller.getState().assignmentState, ASSIGNMENT_STATES.ACTIVE);
  assert.equal(controller.getState().items.length, 2);

  controller.showMyWork(ASSIGNMENT_STATES.COMPLETED);
  assert.equal(
    controller.getState().assignmentState,
    ASSIGNMENT_STATES.COMPLETED,
  );
  assert.deepEqual(
    controller.getState().items.map((item) => item.assignmentId),
    ["assignment-done"],
  );
});

test("SCORE assignment opens existing Practice while CHORD_BOARD never enters SCORE path", () => {
  const { service, calls } = makeStudent08Service();
  const controller = createStudentAppController({
    sharingService: makeLegacySharingService(),
    student08ReadService: service,
    initialSession: session,
    notationAdapter: { isAvailable: () => true },
  });

  controller.openAssignment("assignment-score");
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.PRACTICE);
  assert.equal(controller.getState().practice.title, "Gitar Etüdü");

  controller.showMyWork();
  assert.throws(
    () => controller.openAssignment("assignment-chord"),
    /chord board.*unavailable/i,
  );
  assert.equal(
    calls.some(
      (call) =>
        call[0] === "getScorePracticeItem" &&
        call[1] === "assignment-chord",
    ),
    false,
  );
});

test("STUDENT-08 renderer keeps Havuz presentation-only and exposes lifecycle folders", () => {
  const poolHtml = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.PUBLIC_POOL,
    session: { studentId: "student-a" },
    items: [
      {
        poolItemId: "pool-1",
        title: "Duyuru",
        shortDescription: "Yeni çalışma",
        publishedAt: "2026-09-22T16:00:00Z",
      },
    ],
    practice: null,
  });

  assert.match(poolHtml, /class="student-shell"/);
  assert.match(poolHtml, /data-action="open-pool-item"/);
  assert.doesNotMatch(poolHtml, /open-practice|open-assignment|MusicXML|packageId/);

  const workHtml = renderStudentApp({
    student08: true,
    assignmentState: ASSIGNMENT_STATES.ACTIVE,
    screen: STUDENT_APP_SCREENS.MY_WORK,
    session: { studentId: "student-a" },
    items: [
      {
        assignmentId: "assignment-score",
        title: "Gitar Etüdü",
        practiceType: PRACTICE_TYPES.SCORE,
        teacherNote: "Yavaş çalış.",
        state: ASSIGNMENT_STATES.ACTIVE,
      },
      {
        assignmentId: "assignment-chord",
        title: "Am",
        practiceType: PRACTICE_TYPES.CHORD_BOARD,
        teacherNote: "Parmakları sırayla yerleştir.",
        state: ASSIGNMENT_STATES.ACTIVE,
      },
    ],
    practice: null,
  });

  for (const label of [
    "Aktif Çalışmalar",
    "Bitmiş Çalışmalar",
    "Repertuarım",
  ]) {
    assert.match(workHtml, new RegExp(label));
  }
  assert.match(workHtml, /data-action="open-assignment"/);
  assert.match(workHtml, /Gitar Etüdü/);
  assert.match(workHtml, /Yavaş çalış/);
  assert.match(workHtml, /Akor çalışması/);
  assert.doesNotMatch(workHtml, /recipientStudentIds|student-a|Firebase|XML/);
});

test("new STUDENT-08 shell actions forward only bounded read/navigation values", async () => {
  const calls = [];
  const controller = {
    openPoolItem(id) {
      calls.push(["openPoolItem", id]);
    },
    showMyWork(state) {
      calls.push(["showMyWork", state]);
    },
    openAssignment(id) {
      calls.push(["openAssignment", id]);
    },
  };

  await dispatchStudentAppAction({
    action: "open-pool-item",
    poolItemId: "pool-1",
    controller,
  });
  await dispatchStudentAppAction({
    action: "show-work-folder",
    assignmentState: ASSIGNMENT_STATES.REPERTOIRE,
    controller,
  });
  await dispatchStudentAppAction({
    action: "open-assignment",
    assignmentId: "assignment-score",
    controller,
  });

  assert.deepEqual(calls, [
    ["openPoolItem", "pool-1"],
    ["showMyWork", ASSIGNMENT_STATES.REPERTOIRE],
    ["openAssignment", "assignment-score"],
  ]);
});
