import test from "node:test";
import assert from "node:assert/strict";

import { mountStudentApp } from "../src/ui/mountStudentApp.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";

function practice() {
  return {
    packageId: "pkg-score-a",
    title: "Cambaz",
    capabilities: {
      notation: "AVAILABLE",
      playback: "UNAVAILABLE",
      tempoChange: "UNAVAILABLE",
      measureRepeat: "UNAVAILABLE",
      guitarTab: "UNAVAILABLE",
      violin: "UNAVAILABLE",
    },
    practice: {
      tempoBpm: 80,
      measureRepeatEnabled: false,
    },
  };
}

function workspace(selectedView) {
  return {
    pieceAssignmentId: "piece-a",
    pieceId: "work-a",
    arrangementId: "arr-a",
    title: "Cambaz",
    teacherNote: "",
    selectedView,
    selectedChordId: null,
    availableViews: {
      score: true,
      chords: true,
    },
    returnContext: {
      folderState: "ACTIVE",
      scrollPosition: 0,
    },
    score: {
      status: "AVAILABLE",
      practice: practice(),
    },
    chords: {
      status: "AVAILABLE",
      items: [],
    },
  };
}

function makeRoot() {
  let markup = "";
  let notationRoot = null;

  function makeNotationRoot() {
    const node = {
      parentNode: {
        replaceChild(next, current) {
          if (current === notationRoot) {
            notationRoot = next;
          }
        },
      },
      remove() {
        if (notationRoot === node) {
          notationRoot = null;
        }
      },
      replaceWith(next) {
        if (notationRoot === node) {
          notationRoot = next;
        }
      },
    };

    return node;
  }

  return {
    ownerDocument: {
      activeElement: null,
    },
    addEventListener() {},
    removeEventListener() {},
    contains() {
      return false;
    },
    querySelector(selector) {
      if (selector === "#st-score-root") {
        return notationRoot;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
      notationRoot = value.includes('id="st-score-root"')
        ? makeNotationRoot()
        : null;
    },
  };
}

test("Piece SCORE keeps the exact notation root across SCORE -> CHORDS -> SCORE", async () => {
  let state = {
    student08: true,
    screen: STUDENT_APP_SCREENS.PIECE_WORKSPACE,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    chordBoard: null,
    pieceWorkspace: workspace("SCORE"),
  };
  const root = makeRoot();
  let renderCalls = 0;
  let disposeCalls = 0;

  const controller = {
    getState() {
      return state;
    },
    getPracticeRenderSource() {
      return {
        kind: "musicxml",
        musicXml: "<score-partwise version=\"4.0\"></score-partwise>",
      };
    },
    setNotationCapability() {},
    disposeActivePractice() {},
  };

  const notationAdapter = {
    async render() {
      renderCalls += 1;
      return { capability: "AVAILABLE" };
    },
    async dispose() {
      disposeCalls += 1;
    },
  };

  const mounted = mountStudentApp({
    root,
    controller,
    notationAdapter,
  });
  await mounted.render();

  const first = root.querySelector("#st-score-root");
  assert.notEqual(first, null);
  assert.equal(renderCalls, 1);
  assert.equal(disposeCalls, 0);

  state = {
    ...state,
    pieceWorkspace: workspace("CHORDS"),
  };
  await mounted.render();

  const hidden = root.querySelector("#st-score-root");
  assert.equal(hidden, first);
  assert.equal(disposeCalls, 0);

  state = {
    ...state,
    pieceWorkspace: workspace("SCORE"),
  };
  await mounted.render();

  const second = root.querySelector("#st-score-root");
  assert.equal(second, first);
  assert.equal(renderCalls, 1);
  assert.equal(disposeCalls, 0);

  await mounted.destroy();
});


function makeActionRoot() {
  let listener = null;
  let markup = "";

  return {
    root: {
      ownerDocument: {
        activeElement: null,
        defaultView: {
          scrollY: 360,
        },
      },
      addEventListener(type, callback) {
        if (type === "click") {
          listener = callback;
        }
      },
      removeEventListener(type, callback) {
        if (
          type === "click" &&
          listener === callback
        ) {
          listener = null;
        }
      },
      contains() {
        return true;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      get innerHTML() {
        return markup;
      },
      set innerHTML(value) {
        markup = value;
      },
    },
    async click(dataset) {
      if (listener === null) {
        throw new Error(
          "click listener unavailable",
        );
      }

      const actionElement = {
        dataset,
      };
      await listener({
        target: {
          closest() {
            return actionElement;
          },
        },
      });
    },
  };
}

test("Piece click wiring forwards Piece identity, view, and return scroll context", async () => {
  const actionRoot =
    makeActionRoot();
  const calls = [];
  const state = {
    student08: true,
    screen: STUDENT_APP_SCREENS.MY_WORK,
    session: {
      studentId: "student-a",
    },
    assignmentState: "ACTIVE",
    items: [],
    practice: null,
    chordBoard: null,
  };
  const controller = {
    getState() {
      return state;
    },
    getPracticeRenderSource() {
      return null;
    },
    async openPiece(
      pieceAssignmentId,
      returnContext,
    ) {
      calls.push([
        "open",
        pieceAssignmentId,
        returnContext,
      ]);
    },
    selectPieceView(view) {
      calls.push([
        "view",
        view,
      ]);
    },
    disposeActivePractice() {},
  };

  const mounted = mountStudentApp({
    root: actionRoot.root,
    controller,
  });
  await mounted.render();

  await actionRoot.click({
    action: "open-piece",
    pieceAssignmentId: "piece-a",
    assignmentState: "ACTIVE",
  });
  await actionRoot.click({
    action: "select-piece-view",
    pieceView: "CHORDS",
  });

  assert.deepEqual(calls, [
    [
      "open",
      "piece-a",
      {
        folderState: "ACTIVE",
        scrollPosition: 360,
      },
    ],
    [
      "view",
      "CHORDS",
    ],
  ]);

  await mounted.destroy();
});


test("Piece SCORE -> TAB -> CHORDS -> TAB preserves the exact notation root and rerenders only when source changes", async () => {
  const withTab = (view) => {
    const base = workspace(view);
    return {
      ...base,
      availableViews: {
        score: true,
        tab: true,
        chords: true,
      },
      score: {
        ...base.score,
        practice: {
          ...base.score.practice,
          capabilities: {
            ...base.score.practice.capabilities,
            guitarTab: "AVAILABLE",
          },
        },
      },
    };
  };

  let state = {
    student08: true,
    screen: STUDENT_APP_SCREENS.PIECE_WORKSPACE,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    chordBoard: null,
    pieceWorkspace: withTab("SCORE"),
  };
  const root = makeRoot();
  const rendered = [];
  let disposeCalls = 0;

  const controller = {
    getState() {
      return state;
    },
    getPracticeRenderSource() {
      if (state.pieceWorkspace.selectedView === "TAB") {
        return {
          kind: "musicxml",
          musicXml: "<score-partwise>TAB</score-partwise>",
          sourceId: "pkg-score-a:guitar-tab",
        };
      }
      if (state.pieceWorkspace.selectedView === "SCORE") {
        return {
          kind: "musicxml",
          musicXml: "<score-partwise>SCORE</score-partwise>",
          sourceId: "pkg-score-a",
        };
      }
      return null;
    },
    setNotationCapability() {},
    disposeActivePractice() {},
  };

  const notationAdapter = {
    async render({ musicXml }) {
      rendered.push(musicXml);
      return { capability: "AVAILABLE" };
    },
    async dispose() {
      disposeCalls += 1;
    },
  };

  const mounted = mountStudentApp({
    root,
    controller,
    notationAdapter,
  });

  await mounted.render();
  const firstRoot = root.querySelector("#st-score-root");
  assert.notEqual(firstRoot, null);
  assert.deepEqual(rendered, [
    "<score-partwise>SCORE</score-partwise>",
  ]);

  state = {
    ...state,
    pieceWorkspace: withTab("TAB"),
  };
  await mounted.render();
  assert.equal(root.querySelector("#st-score-root"), firstRoot);
  assert.deepEqual(rendered, [
    "<score-partwise>SCORE</score-partwise>",
    "<score-partwise>TAB</score-partwise>",
  ]);
  assert.equal(disposeCalls, 0);

  state = {
    ...state,
    pieceWorkspace: withTab("CHORDS"),
  };
  await mounted.render();
  assert.equal(root.querySelector("#st-score-root"), firstRoot);
  assert.equal(disposeCalls, 1);

  state = {
    ...state,
    pieceWorkspace: withTab("TAB"),
  };
  await mounted.render();
  assert.equal(root.querySelector("#st-score-root"), firstRoot);
  assert.equal(rendered.length, 2);

  state = {
    ...state,
    pieceWorkspace: withTab("SCORE"),
  };
  await mounted.render();
  assert.equal(root.querySelector("#st-score-root"), firstRoot);
  assert.equal(rendered.length, 3);
  assert.equal(disposeCalls, 0);

  await mounted.destroy();
});


test("TAB render failure does not poison Nota and Nota can render again", async () => {
  const withTab = (view) => {
    const base = workspace(view);
    return {
      ...base,
      availableViews: {
        score: true,
        tab: true,
        chords: true,
      },
      score: {
        ...base.score,
        practice: {
          ...base.score.practice,
          capabilities: {
            ...base.score.practice.capabilities,
            guitarTab: "AVAILABLE",
          },
        },
      },
    };
  };

  let state = {
    student08: true,
    screen: STUDENT_APP_SCREENS.PIECE_WORKSPACE,
    session: { studentId: "student-a" },
    items: [],
    practice: null,
    chordBoard: null,
    pieceWorkspace: withTab("SCORE"),
  };
  const root = makeRoot();
  const rendered = [];
  const capabilityUpdates = [];

  const controller = {
    getState() {
      return state;
    },
    getPracticeRenderSource() {
      const tab =
        state.pieceWorkspace.selectedView === "TAB";
      return {
        kind: "musicxml",
        musicXml: tab
          ? "<score-partwise>TAB</score-partwise>"
          : "<score-partwise>SCORE</score-partwise>",
        sourceId: tab
          ? "pkg-score-a:guitar-tab"
          : "pkg-score-a",
      };
    },
    setNotationCapability(value) {
      capabilityUpdates.push(value);
    },
    disposeActivePractice() {},
  };

  let hostDisposed = false;
  const notationAdapter = {
    async render({ musicXml }) {
      if (hostDisposed) {
        return { capability: "ERROR" };
      }
      rendered.push(musicXml);
      return {
        capability: musicXml.includes("TAB")
          ? "ERROR"
          : "AVAILABLE",
      };
    },
    async dispose() {
      hostDisposed = true;
    },
  };

  const mounted = mountStudentApp({
    root,
    controller,
    notationAdapter,
  });

  await mounted.render();

  state = {
    ...state,
    pieceWorkspace: withTab("TAB"),
  };
  await mounted.render();

  assert.deepEqual(capabilityUpdates, []);
  assert.notEqual(root.querySelector("#st-score-root"), null);

  state = {
    ...state,
    pieceWorkspace: withTab("SCORE"),
  };
  await mounted.render();

  assert.deepEqual(rendered, [
    "<score-partwise>SCORE</score-partwise>",
    "<score-partwise>TAB</score-partwise>",
    "<score-partwise>SCORE</score-partwise>",
  ]);
  assert.deepEqual(capabilityUpdates, []);
  assert.notEqual(root.querySelector("#st-score-root"), null);
  assert.equal(hostDisposed, false);

  await mounted.destroy();
  assert.equal(hostDisposed, true);
});
