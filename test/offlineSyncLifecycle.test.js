import test from "node:test";
import assert from "node:assert/strict";
import { createStudentSession } from "../src/auth/session.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import { createForegroundSyncCoordinator } from "../src/offline/syncCoordinator.js";
import { createStudentAppController } from "../src/ui/studentAppController.js";
import { mountStudentApp } from "../src/ui/mountStudentApp.js";
import { makePrivateDelivery, makeDelivery, makePutArgs } from "./support/practiceFixtures.js";

const session = createStudentSession({ studentId: "student-a" });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const root = () => ({ innerHTML: "", addEventListener() {}, removeEventListener() {}, contains() { return true; }, querySelector() { return null; } });
const tick = () => new Promise((r) => setTimeout(r, 0));

function setupSync(options = {}) {
  const repo = createInMemoryOfflineRepository();
  const coordinator = createForegroundSyncCoordinator({ offlineRepository: repo,
    publicationStatusService: { async getPublicationStatus() { return { state: "ACTIVE", packageId: "pkg-a" }; } }, ...options });
  return { repo, coordinator };
}

test("same-student foreground sync is single-flight", async () => {
  const status = deferred(); let checks = 0;
  const { repo, coordinator } = setupSync({ publicationStatusService: { getPublicationStatus() { checks++; return status.promise; } } });
  await repo.putAuthorized(makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")));
  const first = coordinator.sync({ session }); const second = coordinator.sync({ session });
  await tick(); status.resolve({ state: "REVOKED" });
  await Promise.all([first, second]);
  assert.equal(checks, 1);
  assert.equal(await repo.getActiveByPublicationId({ studentId: "student-a", publicationId: "pub-a" }), null);
});

test("foreground sync includes metadata-only assignments", async () => {
  const { repo, coordinator } = setupSync({
    getCachedAccessRefs: () => [{ kind: "SECURE_DELIVERY", deliveryId: "metadata-only" }],
    secureDeliveryStatusService: { async getAccessStatus() { return { state: "REVOKED" }; } },
  });
  const result = await coordinator.sync({ session });
  assert.equal(result.revoked, 1);
  assert.equal(await repo.isAccessRevoked({ studentId: session.studentId,
    accessRef: { kind: "SECURE_DELIVERY", deliveryId: "metadata-only" } }), true);
});

test("account change during status request cannot write old-session cache decisions", async () => {
  const status = deferred(); let current = true;
  const { repo, coordinator } = setupSync({ isSessionCurrent: () => current,
    publicationStatusService: { getPublicationStatus() { return status.promise; } } });
  await repo.putAuthorized(makePutArgs("student-a", makeDelivery("pub-a", "pkg-a")));
  const pending = coordinator.sync({ session }); await tick(); current = false;
  status.resolve({ state: "REVOKED" }); await pending;
  assert.notEqual(await repo.getActiveByPublicationId({ studentId: "student-a", publicationId: "pub-a" }), null);
});

test("late sync completion cannot change the new account UI state", async () => {
  const result = deferred();
  const controller = createStudentAppController({ sharingService: {}, initialSession: session,
    syncCoordinator: { sync() { return result.promise; } } });
  const pending = controller.synchronizeOffline();
  controller.attachSession(createStudentSession({ studentId: "student-b" }));
  const before = controller.getState(); result.resolve({ state: "SYNC_ERROR" }); await pending;
  assert.equal(controller.getState(), before);
});

test("mount revalidates restored online session without an online event", async () => {
  let listed = true;
  const controller = createStudentAppController({ initialSession: session,
    sharingService: { async listMyWork() { return listed ? [makePrivateDelivery("student-a")] : []; } },
    syncCoordinator: { async sync() { listed = false; return { state: "SYNCED" }; } } });
  await controller.showMyWork();
  const mounted = mountStudentApp({ root: root(), controller,
    connectivityPort: { getState: () => "ONLINE", subscribe() { return () => {}; } } });
  await tick(); await mounted.render();
  assert.deepEqual(controller.getState().items, []);
  await mounted.destroy();
});

test("reconnect refreshes an unchanged My Work list after revocation", async () => {
  let listener; let listed = true;
  const controller = createStudentAppController({ initialSession: session,
    sharingService: { async listMyWork() { return listed ? [makePrivateDelivery("student-a")] : []; } },
    syncCoordinator: { async sync() { listed = false; return { state: "SYNCED" }; } } });
  await controller.showMyWork();
  const mounted = mountStudentApp({ root: root(), controller,
    connectivityPort: { getState: () => "OFFLINE", subscribe(fn) { listener = fn; return () => {}; } } });
  await mounted.render(); listener("ONLINE"); await tick(); await mounted.render();
  assert.deepEqual(controller.getState().items, []); await mounted.destroy();
});

test("background revocation preserves an already-open practice object", async () => {
  const delivery = makePrivateDelivery("student-a");
  const controller = createStudentAppController({ initialSession: session,
    sharingService: { async getPracticeItem() { return delivery; } },
    syncCoordinator: { async sync() { return { state: "SYNCED" }; } } });
  await controller.openPractice(delivery.publication.publicationId);
  const before = controller.getState().practice;
  await controller.synchronizeOffline();
  assert.equal(controller.getState().practice, before);
  assert.equal(controller.getState().screen, "practice");
});

test("shared status service coalesces the same exact Piece check across list and foreground readers", async () => {
  const { createSecureDeliveryStatusService } = await import("../src/offline/secureDeliveryStatusService.js");
  const reply = deferred(); let calls = 0;
  const service = createSecureDeliveryStatusService({ apiClient: {
    async getStudentAssignment() {}, getStudentPiece() { calls++; return reply.promise; },
  } });
  const args = { session, pieceAssignmentId: "piece-a" };
  const first = service.getPieceStatus(args); const second = service.getPieceStatus(args);
  reply.resolve({ schemaVersion: "1.0.0", pieceAssignmentId: "piece-a", pieceId: "work-a", arrangementId: "arr-a",
    title: "Etüd", teacherNote: "", state: "ACTIVE", assignedAt: "2026-10-25T10:00:00Z",
    contentRefs: { scoreAssignmentId: "score-a", chordAssignmentIds: [] } });
  await Promise.all([first, second]); assert.equal(calls, 1);
});

test("sign-in after mounting revalidates offline access without changing navigation", async () => {
  let checks = 0;
  const controller = createStudentAppController({ sharingService: {},
    syncCoordinator: { async sync() { checks++; return { state: "SYNCED" }; } } });
  const mounted = mountStudentApp({ root: root(), controller,
    connectivityPort: { getState: () => "ONLINE", subscribe() { return () => {}; } } });
  await mounted.render(); assert.equal(checks, 0);
  controller.attachSession(session);
  await mounted.revalidateOfflineSession();
  assert.equal(checks, 1); assert.equal(controller.getState().screen, "home");
  await mounted.destroy();
});
