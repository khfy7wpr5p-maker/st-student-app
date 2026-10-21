import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { createStudentAppController } from "../src/ui/studentAppController.js";
import { mountStudentAppPerfA } from "../src/ui/mountStudentAppPerfA.js";
import { createStudentPerfAController, createStudentPerfAReadService } from "../src/ui/studentPerfA.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

// Minimal DOM port for mount events; layout and native browser events remain
// covered separately by browser-tests/student-work-fusion.spec.mjs.
function fixture() {
  const listeners = new Map();
  let markup = "", input = null;
  const root = {
    ownerDocument: { activeElement: null, defaultView: { queueMicrotask } },
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = value;
      root.ownerDocument.activeElement = null;
      const doc = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html");
      const node = Array.from(doc.getElementsByTagName("input")).find(el => el.hasAttribute("data-work-request-title"));
      input = node ? {
        value: node.getAttribute("value"), selectionStart: 0, selectionEnd: 0, selectionDirection: "none",
        matches: selector => selector === "[data-work-request-title]",
        focus() { root.ownerDocument.activeElement = this; },
        setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; },
      } : null;
    },
    contains: () => true,
    querySelector: selector => selector === "[data-work-request-title]" ? input : null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { const entries = listeners.get(type) ?? []; entries.push(fn); listeners.set(type, entries); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter(entry => entry !== fn)); },
  };
  const action = name => ({
    dataset: { action: name },
    disabled: name === "submit-work-request" && /data-action="submit-work-request" disabled/.test(markup),
    closest() { return this; },
  });
  return {
    root, input: () => input,
    fire: async (type, target) => Promise.all((listeners.get(type) ?? []).map(fn => fn({ target, preventDefault() {} }))),
    action,
    form: () => ({ matches: selector => selector === "[data-work-request-form]", querySelector: () => action("submit-work-request") }),
    listenerCount: () => [...listeners.values()].reduce((sum, entries) => sum + entries.length, 0),
  };
}

test("production mount preserves typed draft and selection across delayed inline GET, then submits through form", async () => {
  const read = deferred(), post = deferred(), refreshed = deferred();
  let reads = 0, posts = 0;
  const service = createStudentPerfAReadService({
    listAssignments: () => [], requestWork: () => { posts++; return post.promise; },
    listSharedWorkRequests: () => (++reads === 1 ? read.promise : refreshed.promise),
  });
  const base = createStudentAppController({ sharingService: {}, student08ReadService: service, initialSession: { studentId: "a" } });
  const controller = createStudentPerfAController({ controller: base, readService: service });
  await controller.showMyWork("REPERTOIRE");
  const dom = fixture();
  const mounted = mountStudentAppPerfA({ root: dom.root, controller });
  try {
    const opening = dom.fire("click", dom.action("show-work-request"));
    await Promise.resolve();
    assert.equal(reads, 1);
    const oldInput = dom.input();
    oldInput.value = "Fikrimin İnce Gülü";
    oldInput.focus();
    oldInput.setSelectionRange(3, 8, "forward");
    await dom.fire("input", oldInput);
    read.resolve([{ title: "Etüt", displayNameOrNickname: "Ahmet" }]);
    await opening;
    assert.notEqual(dom.input(), oldInput);
    assert.equal(dom.input().value, "Fikrimin İnce Gülü");
    assert.equal(dom.root.ownerDocument.activeElement, dom.input());
    assert.deepEqual([dom.input().selectionStart, dom.input().selectionEnd], [3, 8]);
    const sending = dom.fire("submit", dom.form());
    const duplicate = dom.fire("submit", dom.form());
    await Promise.resolve();
    assert.equal(posts, 1);
    post.resolve({});
    for (let i = 0; i < 12 && reads < 2; i++) await Promise.resolve();
    assert.equal(reads, 2);
    refreshed.reject(new Error("network"));
    await Promise.all([sending, duplicate]);
    assert.match(dom.root.innerHTML, /İsteğiniz öğretmeninize gönderildi/);
    assert.match(dom.root.innerHTML, /Listeyi yenile/);
    await dom.fire("click", dom.action("back-from-work-request"));
    assert.equal(controller.getState().assignmentState, "REPERTOIRE");
  } finally {
    await mounted.destroy();
  }
  assert.equal(dom.listenerCount(), 0);
});
