import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
import {
  makeChordBoardPracticeItem,
} from "./support/chordBoardFixtures.js";

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

function makeChordBoardItem() {
  return makeChordBoardPracticeItem({
    assignmentId: "assignment-chord",
    title: "Am Akor Çalışması",
    teacherNote:
      "Parmakları sırayla yerleştir.",
    recipientStudentId: "student-a",
    assignedAt: "2026-09-22T16:05:00Z",
  });
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
      getChordBoardPracticeItem({ assignmentId }) {
        calls.push(["getChordBoardPracticeItem", assignmentId]);
        return makeChordBoardItem();
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
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

test("SCORE assignment keeps existing Practice while CHORD_BOARD opens its dedicated screen", () => {
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
  controller.openAssignment("assignment-chord");

  assert.equal(
    controller.getState().screen,
    STUDENT_APP_SCREENS.CHORD_BOARD,
  );
  assert.equal(
    controller.getState().chordBoard.chord.displaySymbol,
    "Am",
  );
  assert.equal(
    calls.some(
      (call) =>
        call[0] === "getScorePracticeItem" &&
        call[1] === "assignment-chord",
    ),
    false,
  );
  assert.equal(
    calls.some(
      (call) =>
        call[0] === "getChordBoardPracticeItem" &&
        call[1] === "assignment-chord",
    ),
    true,
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
  assert.doesNotMatch(
    workHtml,
    /recipientStudentIds|["']student-a["']|>student-a<|Firebase|XML/,
  );
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


test("static shell provides wide 25/75 layout and narrow persistent sidebar layout", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(
    html,
    /\.student-shell\s*\{[^}]*grid-template-columns:\s*minmax\([^)]*\)\s+minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.student-shell\s*\{[^}]*grid-template-columns:\s*minmax\(5\.75rem,\s*28%\)\s+minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    html,
    /\.student-navigation\s+button\s*\{[^}]*width:\s*100%/s,
  );
});


test("STUDENT-08 Practice keeps only the persistent shell navigation", () => {
  const html = renderStudentApp({
    student08: true,
    screen: STUDENT_APP_SCREENS.PRACTICE,
    session: { studentId: "student-a" },
    items: [],
    practice: {
      publicationId: "pub-score",
      packageId: "pkg-score",
      title: "Gitar Etüdü",
      capabilities: {
        notation: "UNAVAILABLE",
        playback: "UNAVAILABLE",
        tempoChange: "UNAVAILABLE",
        measureRepeat: "UNAVAILABLE",
        guitarTab: "UNAVAILABLE",
        violin: "UNAVAILABLE",
      },
      practice: { tempoBpm: 80 },
    },
  });

  assert.match(html, /class="student-shell student-shell-practice"/);
  assert.match(html, /data-action="show-public-pool"/);
  assert.match(html, /data-action="show-my-work"/);
  assert.match(html, /data-action="sign-out"/);
  assert.doesNotMatch(html, /data-action="go-home">Ana Sayfa/);
});


test("legacy shell width stays bounded while STUDENT-08 alone may use wide layout", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(
    html,
    /#app\s*\{[^}]*width:\s*min\(100%,\s*44rem\)/s,
  );
  assert.match(
    html,
    /#app:has\(\.student-shell\)\s*\{[^}]*width:\s*min\(100%,\s*80rem\)/s,
  );
});


test("late STUDENT-08 Pool response from prior account cannot replace current session state", async () => {
  const pending = deferred();
  const studentA = createStudentSession({
    studentId: "student-a",
  });
  const studentB = createStudentSession({
    studentId: "student-b",
  });
  const service = {
    listPoolItems() {
      return pending.promise;
    },
    getPoolItem() {
      throw new Error("unused");
    },
    listAssignments() {
      return [];
    },
    getAssignment() {
      throw new Error("unused");
    },
    getScorePracticeItem() {
      throw new Error("unused");
    },
  };
  const controller = createStudentAppController({
    sharingService: makeLegacySharingService(),
    student08ReadService: service,
    initialSession: studentA,
  });

  const request = controller.showPublicPool();
  controller.attachSession(studentB);

  pending.resolve([
    {
      poolItemId: "student-a-late-pool",
      title: "Eski hesap duyurusu",
      shortDescription: "",
      detailText: "",
      publishedAt: "2026-09-23T11:00:00Z",
      audienceMode: "ALL",
    },
  ]);

  await request;

  assert.equal(
    controller.getState().session.studentId,
    "student-b",
  );
  assert.equal(
    controller.getState().screen,
    STUDENT_APP_SCREENS.HOME,
  );
  assert.notEqual(
    controller.getState().items[0]?.poolItemId,
    "student-a-late-pool",
  );
});
