import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { mountStudentApp } from "../src/ui/mountStudentApp.js";

function makeFocusRoot() {
  let markup = "";
  let activeElement = null;
  let controls = [];
  let restoredAssignmentId = null;

  const ownerDocument = {
    get activeElement() {
      return activeElement;
    },
  };

  function control(assignmentId) {
    return {
      dataset: {
        action: "open-assignment",
        assignmentId,
      },
      focus() {
        restoredAssignmentId = assignmentId;
        activeElement = this;
      },
    };
  }

  const root = {
    ownerDocument,
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
      controls = [control("assignment-a"), control("assignment-b")];
    },
    addEventListener() {},
    removeEventListener() {},
    contains(element) {
      return element === activeElement || controls.includes(element);
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-action]" ? controls : [];
    },
  };

  return {
    root,
    focusSecondAssignment() {
      activeElement = controls[1];
      restoredAssignmentId = null;
    },
    restoredAssignmentId() {
      return restoredAssignmentId;
    },
  };
}

test("STUDENT-08 repaint restores focus to the exact assignment action", async () => {
  const focus = makeFocusRoot();
  let note = "İlk not";

  const controller = {
    getState() {
      return {
        student08: true,
        assignmentState: ASSIGNMENT_STATES.ACTIVE,
        screen: STUDENT_APP_SCREENS.MY_WORK,
        session: { studentId: "student-a" },
        items: [
          {
            assignmentId: "assignment-a",
            title: "Etüt A",
            practiceType: PRACTICE_TYPES.SCORE,
            teacherNote: note,
            state: ASSIGNMENT_STATES.ACTIVE,
          },
          {
            assignmentId: "assignment-b",
            title: "Etüt B",
            practiceType: PRACTICE_TYPES.SCORE,
            teacherNote: note,
            state: ASSIGNMENT_STATES.ACTIVE,
          },
        ],
        practice: null,
      };
    },
    getPracticeRenderSource() {
      return null;
    },
  };

  const mounted = mountStudentApp({
    root: focus.root,
    controller,
  });

  await mounted.render();
  focus.focusSecondAssignment();

  note = "Güncellenen not";
  await mounted.render();

  assert.equal(focus.restoredAssignmentId(), "assignment-b");

  await mounted.destroy();
});
