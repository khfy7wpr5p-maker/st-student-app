import test from "node:test";
import assert from "node:assert/strict";
import { renderStudentApp } from "../src/ui/renderStudentApp.js";

const state = (screen) => ({
  student08: true, screen, session: { studentId: "student-a" },
  items: [], assignmentState: "ACTIVE", practice: null,
});

test("MY_WORK uses a full-width work shell with home, pool and sign-out access", () => {
  const html = renderStudentApp(state("my_work"));
  assert.match(html, /class="student-work-shell"/);
  assert.doesNotMatch(html, /<aside/);
  assert.match(html, /data-action="go-home"/);
  assert.match(html, /data-action="show-public-pool"/);
  assert.match(html, /data-action="sign-out"/);
  for (const folder of ["ACTIVE", "COMPLETED", "REPERTOIRE"]) {
    assert.match(html, new RegExp(`data-assignment-state="${folder}"`));
  }
  assert.match(html, /work-fusion-music\.svg/);
});

test("PUBLIC_POOL keeps the existing shell outside the two work screens", () => {
  const html = renderStudentApp(state("public_pool"));
  assert.match(html, /<aside class="student-navigation"/);
  assert.doesNotMatch(html, /student-work-shell/);
});

test("WORK_REQUEST renders a real form and a separate read-only pending section", () => {
  const html = renderStudentApp({ ...state("work_request"),
    workRequestDraft: 'İnce <Gül>', workRequestPoolStatus: "ready",
    workRequestItems: [{ title: "Etüt", displayNameOrNickname: "Ahmet" }],
  });
  assert.match(html, /<form[^>]*data-work-request-form/);
  assert.match(html, /value="İnce &lt;Gül&gt;"/);
  assert.match(html, /Bekleyen Eser İstekleri/);
  assert.match(html, /Etüt/);
  assert.match(html, /Ahmet/);
  assert.doesNotMatch(html, /<aside/);
  assert.doesNotMatch(renderStudentApp(state("my_work")), /show-shared-request-pool/);
});
