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
