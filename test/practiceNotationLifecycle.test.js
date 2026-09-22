import test from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_CAPABILITY_STATES } from "../src/practice/practiceCapabilities.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { mountStudentApp } from "../src/ui/mountStudentApp.js";

function makePracticeState(
  packageId = "pkg-a",
  notation = PRACTICE_CAPABILITY_STATES.AVAILABLE,
) {
  return {
    screen: STUDENT_APP_SCREENS.PRACTICE,
    session: { studentId: "student-a" },
    items: [],
    practice: {
      publicationId: `pub-${packageId}`,
      packageId,
      title: "Etüt",
      capabilities: {
        notation,
        playback: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        tempoChange: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        measureRepeat: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        guitarTab: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
        violin: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
      },
      practice: { tempoBpm: 80 },
    },
  };
}

function makeHomeState() {
  return {
    screen: STUDENT_APP_SCREENS.HOME,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
  };
}

function makeController(initialState) {
  let state = initialState;
  const calls = [];

  return {
    calls,
    setState(next) {
      state = next;
    },
    controller: {
      getState() {
        return state;
      },
      getPracticeRenderSource() {
        if (state.screen !== STUDENT_APP_SCREENS.PRACTICE) {
          return null;
        }
        return {
          kind: "musicxml",
          musicXml: `<score-partwise>${state.practice.packageId}</score-partwise>`,
          sourceId: state.practice.packageId,
        };
      },
      setNotationCapability(capability) {
        calls.push(["setNotationCapability", capability]);
        state = {
          ...state,
          practice: {
            ...state.practice,
            capabilities: {
              ...state.practice.capabilities,
              notation: capability,
            },
          },
        };
        return state;
      },
      showPublicPool() {},
      showMyWork() {},
      showHome() {},
      openPractice() {},
      signOut() {},
      attachSession() {},
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

function makeRoot() {
  let clickListener = null;
  let tempoValue = "72";

  return {
    innerHTML: "",
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
    removeEventListener(type, listener) {
      if (type === "click" && clickListener === listener) clickListener = null;
    },
    contains() {
      return true;
    },
    querySelector(selector) {
      if (selector === "[data-practice-tempo]") {
        return { value: tempoValue };
      }
      return null;
    },
    setTempoValue(value) {
      tempoValue = value;
    },
    async click(actionElement) {
      if (clickListener === null) {
        throw new Error("click listener missing");
      }
      return clickListener({
        target: {
          closest() {
            return actionElement;
          },
        },
      });
    },
  };
}

function makeAction(action, extra = {}) {
  return {
    dataset: { action },
    checked: extra.checked,
  };
}

function makeNotationAdapter({ result = PRACTICE_CAPABILITY_STATES.AVAILABLE } = {}) {
  const calls = [];

  return {
    calls,
    adapter: {
      isAvailable() {
        return true;
      },
      async render({ musicXml }) {
        calls.push(["render", musicXml]);
        return { capability: result };
      },
      async dispose() {
        calls.push(["dispose"]);
      },
    },
  };
}

test("same Practice presentation renders notation only once", async () => {
  const { controller } = makeController(makePracticeState("pkg-a"));
  const root = makeRoot();
  const { adapter, calls } = makeNotationAdapter();

  const mounted = mountStudentApp({ root, controller, notationAdapter: adapter });

  await mounted.render();
  await mounted.render();

  assert.deepEqual(calls, [
    ["render", "<score-partwise>pkg-a</score-partwise>"],
  ]);
});

test("renderer failure changes only notation to ERROR and does not loop", async () => {
  const { controller, calls: controllerCalls } = makeController(
    makePracticeState("pkg-a"),
  );
  const root = makeRoot();
  const { adapter, calls } = makeNotationAdapter({
    result: PRACTICE_CAPABILITY_STATES.ERROR,
  });

  const mounted = mountStudentApp({ root, controller, notationAdapter: adapter });

  await mounted.render();

  assert.deepEqual(calls, [
    ["render", "<score-partwise>pkg-a</score-partwise>"],
  ]);
  assert.deepEqual(controllerCalls, [
    ["setNotationCapability", PRACTICE_CAPABILITY_STATES.ERROR],
  ]);
  assert.match(root.innerHTML, /Nota görüntülenemedi/);
});

test("leaving Practice disposes active notation runtime", async () => {
  const fixture = makeController(makePracticeState("pkg-a"));
  const root = makeRoot();
  const { adapter, calls } = makeNotationAdapter();

  const mounted = mountStudentApp({
    root,
    controller: fixture.controller,
    notationAdapter: adapter,
  });
  await mounted.render();

  fixture.setState(makeHomeState());
  await mounted.render();

  assert.deepEqual(calls, [
    ["render", "<score-partwise>pkg-a</score-partwise>"],
    ["dispose"],
  ]);
});

test("switching Practice package disposes old runtime before rendering new source", async () => {
  const fixture = makeController(makePracticeState("pkg-a"));
  const root = makeRoot();
  const { adapter, calls } = makeNotationAdapter();

  const mounted = mountStudentApp({
    root,
    controller: fixture.controller,
    notationAdapter: adapter,
  });
  await mounted.render();

  fixture.setState(makePracticeState("pkg-b"));
  await mounted.render();

  assert.deepEqual(calls, [
    ["render", "<score-partwise>pkg-a</score-partwise>"],
    ["dispose"],
    ["render", "<score-partwise>pkg-b</score-partwise>"],
  ]);
});

test("tempo and repeat actions extract only current bounded DOM values", async () => {
  const fixture = makeController(makeHomeState());
  const root = makeRoot();

  const mounted = mountStudentApp({
    root,
    controller: fixture.controller,
  });
  await mounted.render();

  root.setTempoValue("72");
  await root.click(makeAction("set-practice-tempo"));
  await root.click(makeAction("set-measure-repeat", { checked: true }));

  assert.deepEqual(fixture.calls, [
    ["setPracticeTempo", 72],
    ["setMeasureRepeatEnabled", true],
  ]);
});

test("destroy removes listener and disposes active notation runtime", async () => {
  const { controller } = makeController(makePracticeState("pkg-a"));
  const root = makeRoot();
  const { adapter, calls } = makeNotationAdapter();

  const mounted = mountStudentApp({ root, controller, notationAdapter: adapter });
  await mounted.render();
  await mounted.destroy();

  assert.deepEqual(calls, [
    ["render", "<score-partwise>pkg-a</score-partwise>"],
    ["dispose"],
  ]);
  await assert.rejects(
    () => root.click(makeAction("play-practice")),
    /click listener missing/,
  );
});

test("same Practice repaint preserves the renderer root DOM identity", async () => {
  const fixture = makeController(makePracticeState("pkg-a"));
  let markup = "";
  let notationRoot = null;
  let clickListener = null;
  const root = {
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
    removeEventListener(type, listener) {
      if (type === "click" && clickListener === listener) clickListener = null;
    },
    contains() {
      return true;
    },
    querySelector(selector) {
      if (selector === "#st-score-root") return notationRoot;
      return null;
    },
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
      if (value.includes('id="st-score-root"')) {
        const next = {
          replaceWith(existing) {
            notationRoot = existing;
          },
        };
        notationRoot = next;
      } else {
        notationRoot = null;
      }
    },
  };
  const { adapter, calls } = makeNotationAdapter();
  const mounted = mountStudentApp({ root, controller: fixture.controller, notationAdapter: adapter });
  await mounted.render();
  const firstRoot = notationRoot;

  const changed = makePracticeState("pkg-a");
  changed.practice.practice.tempoBpm = 90;
  fixture.setState(changed);
  await mounted.render();

  assert.equal(notationRoot, firstRoot);
  assert.deepEqual(calls, [["render", "<score-partwise>pkg-a</score-partwise>"]]);
});


function makeNotationDomRoot() {
  let markup = "";
  let notationRoot = null;
  let clickListener = null;

  return {
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
    removeEventListener(type, listener) {
      if (type === "click" && clickListener === listener) clickListener = null;
    },
    contains() {
      return true;
    },
    querySelector(selector) {
      if (selector === "#st-score-root") return notationRoot;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getNotationRoot() {
      return notationRoot;
    },
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
      if (value.includes('id="st-score-root"')) {
        const next = {
          replaceWith(existing) {
            notationRoot = existing;
          },
        };
        notationRoot = next;
      } else {
        notationRoot = null;
      }
    },
  };
}

test("renderer root identity survives Practice package switches", async () => {
  const fixture = makeController(makePracticeState("pkg-a"));
  const root = makeNotationDomRoot();
  const { adapter } = makeNotationAdapter();

  const mounted = mountStudentApp({
    root,
    controller: fixture.controller,
    notationAdapter: adapter,
  });
  await mounted.render();
  const firstRoot = root.getNotationRoot();

  fixture.setState(makePracticeState("pkg-b"));
  await mounted.render();

  assert.equal(root.getNotationRoot(), firstRoot);
});

test("renderer root identity survives leaving and reopening Practice", async () => {
  const fixture = makeController(makePracticeState("pkg-a"));
  const root = makeNotationDomRoot();
  const { adapter } = makeNotationAdapter();

  const mounted = mountStudentApp({
    root,
    controller: fixture.controller,
    notationAdapter: adapter,
  });
  await mounted.render();
  const firstRoot = root.getNotationRoot();

  fixture.setState(makeHomeState());
  await mounted.render();
  assert.equal(root.getNotationRoot(), null);

  fixture.setState(makePracticeState("pkg-a"));
  await mounted.render();

  assert.equal(root.getNotationRoot(), firstRoot);
});
