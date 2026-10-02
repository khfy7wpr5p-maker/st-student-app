import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../src/contracts/privateAssignment.js";
import { STUDENT_APP_SCREENS } from "../src/ui/studentAppController.js";
import { mountStudentApp } from "../src/ui/mountStudentApp.js";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

function myWorkState(items, assignmentState = ASSIGNMENT_STATES.ACTIVE) {
  return {
    student08: true,
    screen: STUDENT_APP_SCREENS.MY_WORK,
    session: { studentId: "student-a" },
    assignmentState,
    items,
    practice: null,
  };
}

function piece(index, overrides = {}) {
  return {
    itemKind: "PIECE",
    pieceAssignmentId: `piece-${index}`,
    title: `Etüt ${index}`,
    state: ASSIGNMENT_STATES.ACTIVE,
    assignedAt: `2026-10-${String(Math.min(index, 28)).padStart(2, "0")}T12:00:00Z`,
    ...overrides,
  };
}

test("SES-162 compact list renders 0, 1, 5, 40 and 50 works without truncation", () => {
  for (const count of [0, 1, 5, 40, 50]) {
    const items = Array.from({ length: count }, (_, index) => piece(index + 1));
    const html = renderStudentApp(myWorkState(items));
    const openControls = html.match(/data-action="open-piece"/g) ?? [];

    assert.equal(openControls.length, count, `expected ${count} work controls`);

    if (count === 0) {
      assert.match(html, /Bu klasörde henüz çalışma yok\./);
    } else {
      assert.match(html, new RegExp(`Etüt ${count}`));
      assert.doesNotMatch(html, /class="piece-card"/);
    }
  }
});

test("SES-162 keeps a long Turkish work name as the visible compact title", () => {
  const title = "Uzun İnce Bir Yoldayım — Öğrenci İçin Çok Uzun Türkçe Çalışma Başlığı <Deneme>";
  const html = renderStudentApp(
    myWorkState([
      piece(1, {
        title,
      }),
    ]),
  );

  assert.match(
    html,
    /Uzun İnce Bir Yoldayım — Öğrenci İçin Çok Uzun Türkçe Çalışma Başlığı &lt;Deneme&gt;/,
  );
  assert.doesNotMatch(html, /<Deneme>/);
  assert.match(html, /class="work-title-link"/);
});

test("SES-162 duplicate work names have distinct accessible context without exposing internal IDs", () => {
  const html = renderStudentApp(
    myWorkState([
      piece(1, {
        pieceAssignmentId: "private-piece-alpha",
        title: "Samanyolu",
        assignedAt: "2026-10-01T12:00:00Z",
      }),
      piece(2, {
        pieceAssignmentId: "private-piece-beta",
        title: "Samanyolu",
        assignedAt: "2026-10-02T12:00:00Z",
      }),
    ]),
  );

  assert.match(html, /aria-label="Samanyolu, aynı adlı çalışma 1\/2"/);
  assert.match(html, /aria-label="Samanyolu, aynı adlı çalışma 2\/2"/);

  const alpha = /data-piece-assignment-id="private-piece-alpha"[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? "";
  const beta = /data-piece-assignment-id="private-piece-beta"[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? "";

  assert.match(alpha, /Samanyolu/);
  assert.match(beta, /Samanyolu/);
  assert.doesNotMatch(alpha, /private-piece-alpha|private-piece-beta/);
  assert.doesNotMatch(beta, /private-piece-alpha|private-piece-beta/);
});

function makePieceFocusRoot() {
  let markup = "";
  let activeElement = null;
  let controls = [];
  let restoredPieceAssignmentId = null;

  const ownerDocument = {
    get activeElement() {
      return activeElement;
    },
  };

  function control(pieceAssignmentId) {
    return {
      dataset: {
        action: "open-piece",
        pieceAssignmentId,
        assignmentState: ASSIGNMENT_STATES.ACTIVE,
      },
      focus() {
        restoredPieceAssignmentId = pieceAssignmentId;
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
      controls = [control("piece-a"), control("piece-b")];
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
    focusSecondPiece() {
      activeElement = controls[1];
      restoredPieceAssignmentId = null;
    },
    restoredPieceAssignmentId() {
      return restoredPieceAssignmentId;
    },
  };
}

test("SES-162 repaint restores focus to the exact Piece title among many work links", async () => {
  const focus = makePieceFocusRoot();
  let secondTitle = "Etüt B";

  const controller = {
    getState() {
      return myWorkState([
        piece(1, {
          pieceAssignmentId: "piece-a",
          title: "Etüt A",
        }),
        piece(2, {
          pieceAssignmentId: "piece-b",
          title: secondTitle,
        }),
      ]);
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
  focus.focusSecondPiece();

  secondTitle = "Etüt B (güncellendi)";
  await mounted.render();

  assert.equal(focus.restoredPieceAssignmentId(), "piece-b");

  await mounted.destroy();
});

test("SES-162 keeps SCORE and Piece work identities separate in one compact folder", () => {
  const html = renderStudentApp(
    myWorkState([
      piece(1, { title: "Parça A" }),
      {
        assignmentId: "score-a",
        title: "Parça B",
        practiceType: PRACTICE_TYPES.SCORE,
        teacherNote: "",
        state: ASSIGNMENT_STATES.ACTIVE,
        assignedAt: "2026-10-03T12:00:00Z",
      },
    ]),
  );

  assert.equal((html.match(/class="work-title-link"/g) ?? []).length, 2);
  assert.match(html, /data-action="open-piece"[^>]*data-piece-assignment-id="piece-1"/s);
  assert.match(html, /data-action="open-assignment"[^>]*data-assignment-id="score-a"/s);
  assert.match(html, /Parça A/);
  assert.match(html, /Parça B/);
});
