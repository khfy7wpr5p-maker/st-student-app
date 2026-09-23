import test from "node:test";
import assert from "node:assert/strict";

import { createStudentSession } from "../src/auth/session.js";
import { PRACTICE_CAPABILITY_STATES } from "../src/practice/practiceCapabilities.js";
import {
  STUDENT_APP_SCREENS,
  createStudentAppController,
} from "../src/ui/studentAppController.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

const student = createStudentSession({
  studentId: "student-a",
  displayName: "Ali",
});

function makeApprovedPracticePackage() {
  return {
    schemaVersion: "1.0.0",
    packageId: "pkg-public",
    workId: "work-public",
    title: "Public Etüt",
    approvedRevision: {
      revisionId: "R1",
      state: "teacher_approved",
      approvedAt: "2026-09-21T12:00:00Z",
    },
    publication: {
      scope: "public_pool",
    },
    content: {
      score: {
        format: "musicxml",
        data: "<score-partwise>SECRET SCORE</score-partwise>",
      },
      canonicalEvents: [{ unknown: "shape" }],
      guitarTab: { unknown: true },
      violin: { unknown: true },
    },
    practice: {
      tempoBpm: 80,
      allowTempoChange: true,
      allowMeasureRepeat: true,
      ttsLanguage: "tr-TR",
    },
  };
}

function makeSharingService() {
  return {
    listPublicPool({ session }) {
      assert.equal(session.studentId, "student-a");
      return [
        {
          publication: {
            publicationId: "pub-public",
            packageId: "pkg-public",
            scope: "public_pool",
          },
          package: {
            packageId: "pkg-public",
            title: "Public Etüt",
            content: {
              score: {
                format: "musicxml",
                data: "<score-partwise>SECRET SCORE</score-partwise>",
              },
            },
          },
        },
      ];
    },

    listMyWork({ session }) {
      assert.equal(session.studentId, "student-a");
      return [
        {
          publication: {
            publicationId: "pub-private",
            packageId: "pkg-private",
            scope: "student_private",
            recipientStudentId: "student-a",
          },
          package: {
            packageId: "pkg-private",
            title: "Özel Etüt",
            debug: { trace: "secret" },
          },
        },
      ];
    },

    getPracticeItem({ session, publicationId }) {
      assert.equal(session.studentId, "student-a");
      assert.equal(publicationId, "pub-public");

      return {
        publication: {
          publicationId,
          packageId: "pkg-public",
          scope: "public_pool",
        },
        package: makeApprovedPracticePackage(),
      };
    },
  };
}

function makePlaybackPort() {
  const calls = [];

  return {
    calls,
    port: {
      canPlayPackage: () => true,
      playPackage(pkg) {
        calls.push(["play", pkg.packageId]);
      },
      pausePackage(pkg) {
        calls.push(["pause", pkg.packageId]);
      },
      restartPackage(pkg) {
        calls.push(["restart", pkg.packageId]);
      },
      canChangeTempoForPackage: () => true,
      setTempoForPackage(pkg, bpm) {
        calls.push(["tempo", pkg.packageId, bpm]);
      },
      canRepeatMeasureForPackage: () => true,
      setMeasureRepeatEnabledForPackage(pkg, enabled) {
        calls.push(["repeat", pkg.packageId, enabled]);
      },
      getPlaybackQualityForPackage: () => "APPROXIMATE",
      getReferenceTempoForPackage: () => 80,
    },
  };
}

test("unauthenticated controller starts at sign in", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.SIGN_IN);
  assert.equal(controller.getState().session, null);
});

test("attaching a valid session enters home", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  controller.attachSession(student);

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.HOME);
  assert.equal(controller.getState().session.studentId, "student-a");
});

test("invalid session cannot be attached", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  assert.throws(
    () => controller.attachSession({ displayName: "Ali" }),
    /authenticated student session required/,
  );
});

test("Public Pool becomes a safe summary list", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.showPublicPool();

  const state = controller.getState();
  assert.equal(state.screen, STUDENT_APP_SCREENS.PUBLIC_POOL);
  assert.deepEqual(state.items, [
    {
      publicationId: "pub-public",
      packageId: "pkg-public",
      title: "Public Etüt",
    },
  ]);
  assert.equal(JSON.stringify(state).includes("SECRET SCORE"), false);
});

test("My Work becomes a safe summary list without recipient id", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.showMyWork();

  const state = controller.getState();
  assert.equal(state.screen, STUDENT_APP_SCREENS.MY_WORK);
  assert.deepEqual(state.items, [
    {
      publicationId: "pub-private",
      packageId: "pkg-private",
      title: "Özel Etüt",
    },
  ]);
  assert.equal(JSON.stringify(state).includes("recipientStudentId"), false);
  assert.equal(JSON.stringify(state).includes("secret"), false);
});

test("Open Practice stores safe workspace but keeps MusicXML private", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
  });

  controller.openPractice("pub-public");

  const state = controller.getState();
  assert.equal(state.screen, STUDENT_APP_SCREENS.PRACTICE);
  assert.equal(state.practice.publicationId, "pub-public");
  assert.equal(state.practice.packageId, "pkg-public");
  assert.equal(state.practice.title, "Public Etüt");
  assert.equal(
    state.practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
  assert.equal(
    state.practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
  assert.equal(JSON.stringify(state).includes("SECRET SCORE"), false);
  assert.equal(JSON.stringify(state).includes("approvedRevision"), false);
  assert.equal(JSON.stringify(state).includes("canonicalEvents"), false);

  assert.deepEqual(controller.getPracticeRenderSource(), {
    kind: "musicxml",
    musicXml: "<score-partwise>SECRET SCORE</score-partwise>",
    sourceId: "pkg-public",
  });
});

test("missing notation runtime keeps workspace open and notation unavailable", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => false },
  });

  controller.openPractice("pub-public");

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.PRACTICE);
  assert.equal(
    controller.getState().practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
});

test("notation ERROR does not change independent playback state", () => {
  const { port } = makePlaybackPort();
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
    playbackPort: port,
  });

  controller.openPractice("pub-public");
  const before = controller.getState().practice.capabilities.playback;
  controller.setNotationCapability(PRACTICE_CAPABILITY_STATES.ERROR);

  assert.equal(
    controller.getState().practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );
  assert.equal(controller.getState().practice.capabilities.playback, before);
  assert.equal(before, PRACTICE_CAPABILITY_STATES.AVAILABLE);
});

test("Practice render source is unavailable outside the Practice screen", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
  });

  assert.equal(controller.getPracticeRenderSource(), null);
  controller.openPractice("pub-public");
  assert.notEqual(controller.getPracticeRenderSource(), null);

  controller.showHome();
  assert.equal(controller.getPracticeRenderSource(), null);

  controller.openPractice("pub-public");
  controller.signOut();
  assert.equal(controller.getPracticeRenderSource(), null);
});

test("trusted playback controls delegate with the private package only", () => {
  const { port, calls } = makePlaybackPort();
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => false },
    playbackPort: port,
  });

  controller.openPractice("pub-public");
  controller.playPractice();
  controller.pausePractice();
  controller.restartPractice();
  controller.setPracticeTempo(72);
  controller.setMeasureRepeatEnabled(true);

  assert.deepEqual(calls, [
    ["play", "pkg-public"],
    ["pause", "pkg-public"],
    ["restart", "pkg-public"],
    ["tempo", "pkg-public", 72],
    ["repeat", "pkg-public", true],
  ]);
  assert.equal(JSON.stringify(controller.getState()).includes("work-public"), false);
  assert.equal(JSON.stringify(controller.getState()).includes("canonicalEvents"), false);
});

test("practice controls reject when their capability is unavailable", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
  });

  controller.openPractice("pub-public");

  assert.throws(() => controller.playPractice(), /capability unavailable/);
  assert.throws(() => controller.pausePractice(), /capability unavailable/);
  assert.throws(() => controller.restartPractice(), /capability unavailable/);
  assert.throws(() => controller.setPracticeTempo(72), /capability unavailable/);
  assert.throws(
    () => controller.setMeasureRepeatEnabled(true),
    /capability unavailable/,
  );
});

test("practice controls validate tempo and repeat values before delegation", () => {
  const { port, calls } = makePlaybackPort();
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");

  for (const value of [
    0,
    -1,
    19,
    301,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(
      () => controller.setPracticeTempo(value),
      /between 20 and 300/,
    );
  }
  assert.throws(
    () => controller.setMeasureRepeatEnabled("yes"),
    /repeat enabled must be boolean/,
  );
  assert.deepEqual(calls, []);
});

test("navigating or changing session clears private Practice source", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
  });

  controller.openPractice("pub-public");
  controller.showPublicPool();
  assert.equal(controller.getPracticeRenderSource(), null);

  controller.openPractice("pub-public");
  controller.attachSession(student);
  assert.equal(controller.getPracticeRenderSource(), null);
});

test("sign out clears session and student data", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.showPublicPool();
  controller.signOut();

  assert.deepEqual(controller.getState(), {
    screen: STUDENT_APP_SCREENS.SIGN_IN,
    session: null,
    items: [],
    practice: null,
  });
});

test("student controller exposes no sharing write operations", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  assert.equal("publish" in controller, false);
  assert.equal("revoke" in controller, false);
  assert.equal("edit" in controller, false);
  assert.equal("delete" in controller, false);
});

test("controller snapshots the authenticated student id", () => {
  const mutableSession = {
    studentId: "student-a",
    email: "student@example.test",
    displayName: "Ali",
  };
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
  });

  controller.attachSession(mutableSession);
  mutableSession.studentId = "student-b";
  mutableSession.email = "changed@example.test";

  const state = controller.getState();

  assert.deepEqual(state.session, { studentId: "student-a" });
  assert.equal(Object.isFrozen(state.session), true);
});

test("controller exposes immutable UI state", () => {
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
  });

  controller.showPublicPool();
  const state = controller.getState();

  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.items), true);
  assert.equal(Object.isFrozen(state.items[0]), true);
  assert.throws(
    () =>
      state.items.push({
        publicationId: "fake",
        packageId: "fake",
        title: "Fake",
      }),
    TypeError,
  );
});


test("playback runtime failure changes playback to ERROR without changing notation", async () => {
  const { port } = makePlaybackPort();
  port.playPackage = async () => {
    throw new Error("audio backend secret failure");
  };

  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
    playbackPort: port,
  });

  controller.openPractice("pub-public");

  await assert.rejects(
    () => controller.playPractice(),
    /audio backend secret failure/,
  );

  assert.equal(
    controller.getState().practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );
  assert.equal(
    controller.getState().practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
  assert.equal(
    JSON.stringify(controller.getState()).includes("audio backend secret"),
    false,
  );
});

test("tempo runtime failure changes only tempo capability to ERROR", () => {
  const { port } = makePlaybackPort();
  port.setTempoForPackage = () => {
    throw new Error("tempo backend failure");
  };

  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");

  assert.throws(
    () => controller.setPracticeTempo(72),
    /tempo backend failure/,
  );

  assert.equal(
    controller.getState().practice.capabilities.tempoChange,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );
  assert.equal(
    controller.getState().practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
});

test("measure repeat runtime failure changes only repeat capability to ERROR", () => {
  const { port } = makePlaybackPort();
  port.setMeasureRepeatEnabledForPackage = () => {
    throw new Error("repeat backend failure");
  };

  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");

  assert.throws(
    () => controller.setMeasureRepeatEnabled(true),
    /repeat backend failure/,
  );

  assert.equal(
    controller.getState().practice.capabilities.measureRepeat,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );
  assert.equal(
    controller.getState().practice.practice.measureRepeatEnabled,
    false,
  );
  assert.equal(
    controller.getState().practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
});


test("async Practice read cannot restore a previous student after account switch", async () => {
  let resolvePractice;
  const pendingPractice = new Promise((resolve) => {
    resolvePractice = resolve;
  });
  const sharingService = {
    ...makeSharingService(),
    getPracticeItem() {
      return pendingPractice;
    },
  };
  const studentB = createStudentSession({
    studentId: "student-b",
    displayName: "Bora",
  });
  const controller = createStudentAppController({
    sharingService,
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
  });

  const pending = controller.openPractice("pub-public");
  controller.attachSession(studentB);
  resolvePractice({
    publication: {
      publicationId: "pub-public",
      packageId: "pkg-public",
      scope: "public_pool",
    },
    package: makeApprovedPracticePackage(),
  });

  await pending;

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.HOME);
  assert.equal(controller.getState().session.studentId, "student-b");
  assert.equal(controller.getState().practice, null);
  assert.equal(controller.getPracticeRenderSource(), null);
});

test("async list read cannot restore a previous student after sign out", async () => {
  let resolveList;
  const pendingList = new Promise((resolve) => {
    resolveList = resolve;
  });
  const sharingService = {
    ...makeSharingService(),
    listMyWork() {
      return pendingList;
    },
  };
  const controller = createStudentAppController({
    sharingService,
    initialSession: student,
  });

  const pending = controller.showMyWork();
  controller.signOut();
  resolveList([]);

  await pending;

  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.SIGN_IN);
  assert.equal(controller.getState().session, null);
});


test("Practice authority boundaries dispose active playback best-effort", () => {
  for (const action of [
    "showHome",
    "showPublicPool",
    "showMyWork",
    "attachSession",
    "signOut",
  ]) {
    const { port, calls } = makePlaybackPort();
    port.disposePackage = (value) => {
      calls.push(["dispose", value.packageId]);
    };
    const controller = createStudentAppController({
      sharingService: makeSharingService(),
      initialSession: student,
      playbackPort: port,
    });

    controller.openPractice("pub-public");

    if (action === "attachSession") {
      controller.attachSession(student);
    } else {
      controller[action]();
    }

    assert.deepEqual(
      calls.filter(([name]) => name === "dispose"),
      [["dispose", "pkg-public"]],
      action,
    );
  }
});

test("opening a second Practice disposes the previous playback package", () => {
  const { port, calls } = makePlaybackPort();
  port.disposePackage = (value) => {
    calls.push(["dispose", value.packageId]);
  };
  const sharing = {
    ...makeSharingService(),
    getPracticeItem({ publicationId }) {
      const packageId = publicationId === "pub-b" ? "pkg-b" : "pkg-a";
      const work = makeApprovedPracticePackage();
      work.packageId = packageId;
      work.workId = "work-" + packageId;
      work.title = packageId;
      return {
        publication: {
          publicationId,
          packageId,
          scope: "public_pool",
        },
        package: work,
      };
    },
  };
  const controller = createStudentAppController({
    sharingService: sharing,
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-a");
  controller.openPractice("pub-b");

  assert.deepEqual(
    calls.filter(([name]) => name === "dispose"),
    [["dispose", "pkg-a"]],
  );
  assert.equal(controller.getState().practice.packageId, "pkg-b");
});

test("playback dispose failure cannot block navigation", () => {
  const { port } = makePlaybackPort();
  port.disposePackage = () => {
    throw new Error("secret teardown failure");
  };
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");

  assert.doesNotThrow(() => controller.showHome());
  assert.equal(controller.getState().screen, STUDENT_APP_SCREENS.HOME);
});

test("successful tempo update changes only safe UI tempo", () => {
  const sourcePackage = makeApprovedPracticePackage();
  const { port } = makePlaybackPort();
  const sharing = {
    ...makeSharingService(),
    getPracticeItem({ publicationId }) {
      return {
        publication: {
          publicationId,
          packageId: sourcePackage.packageId,
          scope: "public_pool",
        },
        package: sourcePackage,
      };
    },
  };
  const controller = createStudentAppController({
    sharingService: sharing,
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");
  controller.setPracticeTempo(60);

  assert.equal(controller.getState().practice.practice.tempoBpm, 60);
  assert.equal(sourcePackage.practice.tempoBpm, 80);
});

test("async tempo update changes UI only after successful delegation", async () => {
  let resolveTempo;
  const pending = new Promise((resolve) => {
    resolveTempo = resolve;
  });
  const { port } = makePlaybackPort();
  port.setTempoForPackage = () => pending;
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");
  const operation = controller.setPracticeTempo(60);

  assert.equal(controller.getState().practice.practice.tempoBpm, 80);
  resolveTempo();
  await operation;
  assert.equal(controller.getState().practice.practice.tempoBpm, 60);
});

test("failed async tempo update preserves prior safe UI tempo", async () => {
  const { port } = makePlaybackPort();
  port.setTempoForPackage = async () => {
    throw new Error("private tempo provider detail");
  };
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");

  await assert.rejects(() => controller.setPracticeTempo(60));
  assert.equal(controller.getState().practice.practice.tempoBpm, 80);
  assert.equal(
    controller.getState().practice.capabilities.tempoChange,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );
  assert.equal(
    JSON.stringify(controller.getState()).includes("private tempo provider"),
    false,
  );
});

test("successful repeat update changes only safe UI repeat state", () => {
  const { port } = makePlaybackPort();
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    playbackPort: port,
  });

  controller.openPractice("pub-public");
  assert.equal(
    controller.getState().practice.practice.measureRepeatEnabled,
    false,
  );

  controller.setMeasureRepeatEnabled(true);

  assert.equal(
    controller.getState().practice.practice.measureRepeatEnabled,
    true,
  );
});


test("unsupported playback plan leaves notation available while playback is unavailable", () => {
  const playbackPort = {
    canPlayPackage: () => false,
    playPackage() {},
    pausePackage() {},
    restartPackage() {},
    canChangeTempoForPackage: () => false,
    setTempoForPackage() {},
    canRepeatMeasureForPackage: () => false,
    setMeasureRepeatEnabledForPackage() {},
    getPlaybackQualityForPackage: () => null,
    getReferenceTempoForPackage: () => null,
  };
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
    playbackPort,
  });

  controller.openPractice("pub-public");

  assert.equal(
    controller.getState().practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
  assert.equal(
    controller.getState().practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );
  assert.equal(controller.getState().practice.playbackQuality, null);
});

test("stale or missing sample failure is playback-only and never reaches state or HTML", async () => {
  const { port } = makePlaybackPort();
  port.playPackage = async () => {
    throw new Error(
      "piano sample load stale: ./vendor/st-piano/samples/C4.wav",
    );
  };
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
    playbackPort: port,
  });

  controller.openPractice("pub-public");

  await assert.rejects(
    () => controller.playPractice(),
    /piano sample load stale/,
  );

  const state = controller.getState();
  const serialized = JSON.stringify(state);
  const html = renderStudentApp(state);

  assert.equal(
    state.practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.ERROR,
  );
  assert.equal(
    state.practice.capabilities.notation,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
  assert.doesNotMatch(
    serialized,
    /piano sample load stale|vendor\/st-piano|C4\.wav|score-partwise|notes/,
  );
  assert.doesNotMatch(
    html,
    /piano sample load stale|vendor\/st-piano|C4\.wav|score-partwise|notes/,
  );
});


test("active Practice playback capability recovers after connectivity restores audio preparation", async () => {
  let ready = false;
  const playbackPort = {
    canPlayPackage() {
      return ready;
    },
    async preparePackage() {
      ready = true;
      return true;
    },
    canChangeTempoForPackage() {
      return ready;
    },
    canRepeatMeasureForPackage() {
      return ready;
    },
    getPlaybackQualityForPackage() {
      return ready ? "APPROXIMATE" : null;
    },
    getReferenceTempoForPackage() {
      return ready ? 80 : null;
    },
  };
  const controller = createStudentAppController({
    sharingService: makeSharingService(),
    initialSession: student,
    notationAdapter: { isAvailable: () => true },
    playbackPort,
  });

  controller.openPractice("pub-public");
  assert.equal(
    controller.getState().practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  );

  await controller.recoverActivePracticePlayback();

  assert.equal(
    controller.getState().practice.capabilities.playback,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
  assert.equal(
    controller.getState().practice.capabilities.tempoChange,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
  assert.equal(
    controller.getState().practice.capabilities.measureRepeat,
    PRACTICE_CAPABILITY_STATES.AVAILABLE,
  );
});
