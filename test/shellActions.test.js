import test from "node:test";
import assert from "node:assert/strict";

import { dispatchStudentAppAction } from "../src/ui/shellActions.js";

function makeController() {
  const calls = [];

  return {
    calls,
    controller: {
      showPublicPool() {
        calls.push(["showPublicPool"]);
      },
      showMyWork() {
        calls.push(["showMyWork"]);
      },
      showHome() {
        calls.push(["showHome"]);
      },
      openPractice(publicationId) {
        calls.push(["openPractice", publicationId]);
      },
      signOut() {
        calls.push(["signOut"]);
      },
      attachSession(session) {
        calls.push(["attachSession", session]);
      },
      playPractice() {
        calls.push(["playPractice"]);
      },
      pausePractice() {
        calls.push(["pausePractice"]);
      },
      restartPractice() {
        calls.push(["restartPractice"]);
      },
      setPracticeTempo(bpm) {
        calls.push(["setPracticeTempo", bpm]);
      },
      setMeasureRepeatEnabled(enabled) {
        calls.push(["setMeasureRepeatEnabled", enabled]);
      },
    },
  };
}

test("navigation actions call only the matching read controller methods", async () => {
  const { controller, calls } = makeController();

  await dispatchStudentAppAction({
    action: "show-public-pool",
    controller,
  });
  await dispatchStudentAppAction({
    action: "show-my-work",
    controller,
  });
  await dispatchStudentAppAction({
    action: "go-home",
    controller,
  });

  assert.deepEqual(calls, [
    ["showPublicPool"],
    ["showMyWork"],
    ["showHome"],
  ]);
});

test("open-practice requires and forwards publication id", async () => {
  const { controller, calls } = makeController();

  await dispatchStudentAppAction({
    action: "open-practice",
    publicationId: "pub-1",
    controller,
  });

  assert.deepEqual(calls, [["openPractice", "pub-1"]]);

  await assert.rejects(
    () =>
      dispatchStudentAppAction({
        action: "open-practice",
        controller,
      }),
    /publication id required/,
  );
});

test("sign-out delegates to controller", async () => {
  const { controller, calls } = makeController();

  await dispatchStudentAppAction({
    action: "sign-out",
    controller,
  });

  assert.deepEqual(calls, [["signOut"]]);
});

test("host auth callback attaches returned session", async () => {
  const { controller, calls } = makeController();
  const session = { studentId: "student-a" };

  await dispatchStudentAppAction({
    action: "request-sign-in",
    controller,
    requestSignIn: async () => session,
  });

  assert.deepEqual(calls, [["attachSession", session]]);
});

test("missing auth callback does not mint a fake session", async () => {
  const { controller, calls } = makeController();

  await assert.rejects(
    () =>
      dispatchStudentAppAction({
        action: "request-sign-in",
        controller,
      }),
    /sign-in provider is not configured/,
  );

  assert.deepEqual(calls, []);
});

test("practice actions forward only approved control values", async () => {
  const { controller, calls } = makeController();

  await dispatchStudentAppAction({
    action: "play-practice",
    controller,
  });
  await dispatchStudentAppAction({
    action: "pause-practice",
    controller,
  });
  await dispatchStudentAppAction({
    action: "restart-practice",
    controller,
  });
  await dispatchStudentAppAction({
    action: "set-practice-tempo",
    tempoBpm: 72,
    controller,
  });
  await dispatchStudentAppAction({
    action: "set-measure-repeat",
    repeatEnabled: true,
    controller,
  });

  assert.deepEqual(calls, [
    ["playPractice"],
    ["pausePractice"],
    ["restartPractice"],
    ["setPracticeTempo", 72],
    ["setMeasureRepeatEnabled", true],
  ]);
});

test("write or unknown actions are rejected", async () => {
  const { controller, calls } = makeController();

  for (const action of ["publish", "revoke", "edit", "delete", "unknown"]) {
    await assert.rejects(
      () => dispatchStudentAppAction({ action, controller }),
      /unsupported student app action/,
    );
  }

  assert.deepEqual(calls, []);
});
