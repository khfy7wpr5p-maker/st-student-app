import test from "node:test";
import assert from "node:assert/strict";
import { createStudentSession } from "../src/auth/session.js";
import { createInMemoryOfflineRepository } from "../src/offline/inMemoryOfflineRepository.js";
import { createSecureDeliveryOfflineReadService } from "../src/offline/secureDeliveryOfflineReadService.js";
import { makeApprovedPracticePackage } from "./support/practiceFixtures.js";

const session = createStudentSession({ studentId: "student-a" });
const now = "2026-10-25T10:00:00Z";
const piece = { schemaVersion: "1.0.0", pieceAssignmentId: "piece-a", pieceId: "work-a", arrangementId: "arr-a",
  title: "Etüd", teacherNote: "", state: "ACTIVE", assignedAt: now,
  contentRefs: { scoreAssignmentId: "score-a", chordAssignmentIds: [] } };
const assignment = { assignmentId: "score-a", title: "Etüd", practiceType: "SCORE", teacherNote: "", state: "ACTIVE",
  assignedAt: now, sourceRef: { sourceKind: "SECURE_DELIVERY", deliveryId: "score-a" } };
const item = { accessRef: { kind: "SECURE_DELIVERY", deliveryId: "score-a" }, practiceType: "SCORE",
  package: makeApprovedPracticePackage({ packageId: "pkg-a", scope: "student_private", recipientStudentId: "server-student-a" }) };
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  let connection = "ONLINE";
  const repo = createInMemoryOfflineRepository();
  const online = { async listPoolItems() { return []; }, async getPoolItem() {},
    async listAssignments() { return [assignment]; }, async getAssignment() { return assignment; },
    async getScorePracticeItem() { return item; }, async getChordBoardPracticeItem() {},
    async listPieces() { return [piece]; }, async getPiece() { return piece; },
    async getPieceScoreItem() { return item; }, async listPieceChordItems() { return []; } };
  const status = { async getAccessStatus() { return { state: "REVOKED" }; },
    async getPieceStatus() { return { state: "REVOKED" }; } };
  const service = createSecureDeliveryOfflineReadService({ onlineReadService: online, offlineRepository: repo,
    connectivityPort: { getState: () => connection }, secureDeliveryStatusService: status, clock: () => now });
  return { repo, online, status, service, offline() { connection = "OFFLINE"; } };
}

test("online list removal followed by exact revoked status removes Piece and legacy rows offline", async () => {
  const f = fixture();
  await f.service.listPieces({ session, state: "ACTIVE" });
  await f.service.listAssignments({ session, state: "ACTIVE" });
  await f.service.getScorePracticeItem({ session, assignmentId: "score-a" });
  f.online.listPieces = async () => [];
  f.online.listAssignments = async () => [];
  await f.service.listPieces({ session, state: "ACTIVE" });
  await f.service.listAssignments({ session, state: "ACTIVE" });
  f.offline();
  assert.deepEqual(await f.service.listPieces({ session }), []);
  assert.deepEqual(await f.service.listAssignments({ session }), []);
  await assert.rejects(() => f.service.getScorePracticeItem({ session, assignmentId: "score-a" }));
});

test("absence from ACTIVE preserves a work moved to REPERTOIRE", async () => {
  const f = fixture();
  await f.service.listPieces({ session });
  await f.service.listAssignments({ session });
  f.online.listPieces = async () => [];
  f.online.listAssignments = async () => [];
  f.status.getPieceStatus = async () => ({ state: "ACTIVE", piece: { ...piece, state: "REPERTOIRE" } });
  f.status.getAccessStatus = async () => ({ state: "ACTIVE", packageId: "pkg-a" });
  f.online.getAssignment = async () => ({ ...assignment, state: "REPERTOIRE" });
  await f.service.listPieces({ session, state: "ACTIVE" });
  await f.service.listAssignments({ session, state: "ACTIVE" });
  f.offline();
  assert.deepEqual(await f.service.listPieces({ session, state: "ACTIVE" }), []);
  assert.deepEqual(await f.service.listAssignments({ session, state: "ACTIVE" }), []);
  assert.equal((await f.service.listPieces({ session, state: "REPERTOIRE" })).length, 1);
  assert.equal((await f.service.listAssignments({ session, state: "REPERTOIRE" })).length, 1);
});

for (const state of ["throws", "UNKNOWN"]) {
  test(`missing-list status ${state} preserves valid offline content`, async () => {
    const f = fixture();
    await f.service.listPieces({ session }); await f.service.listAssignments({ session });
    await f.service.getScorePracticeItem({ session, assignmentId: "score-a" });
    f.online.listPieces = async () => []; f.online.listAssignments = async () => [];
    const unavailable = async () => { if (state === "throws") throw new Error("temporary auth/network failure"); return { state }; };
    f.status.getPieceStatus = unavailable; f.status.getAccessStatus = unavailable;
    await f.service.listPieces({ session }); await f.service.listAssignments({ session }); f.offline();
    assert.equal((await f.service.listPieces({ session })).length, 1);
    assert.equal((await f.service.listAssignments({ session })).length, 1);
    assert.equal((await f.service.getScorePracticeItem({ session, assignmentId: "score-a" })).package.packageId, "pkg-a");
  });
}

test("late assignment metadata and practice responses cannot reopen a revoked delivery", async () => {
  const f = fixture(); const detail = deferred(); const practice = deferred();
  await f.service.listAssignments({ session });
  f.online.getAssignment = () => detail.promise; f.online.getScorePracticeItem = () => practice.promise;
  const pendingDetail = f.service.getAssignment({ session, assignmentId: "score-a" });
  const pendingPractice = f.service.getScorePracticeItem({ session, assignmentId: "score-a" });
  const detailRejected = assert.rejects(pendingDetail); const practiceRejected = assert.rejects(pendingPractice);
  await f.repo.markRevoked({ studentId: session.studentId, accessRef: item.accessRef, lastVerifiedAt: now });
  detail.resolve(assignment); practice.resolve(item);
  await Promise.all([detailRejected, practiceRejected]); f.offline();
  assert.deepEqual(await f.service.listAssignments({ session }), []);
});

test("late Piece list response does not resurrect a revoked manifest or return it as a new row", async () => {
  const f = fixture(); const list = deferred();
  await f.service.listPieces({ session });
  f.online.listPieces = () => list.promise;
  const pending = f.service.listPieces({ session });
  await f.repo.revokePieceAccess({ studentId: session.studentId, pieceAssignmentId: "piece-a", lastVerifiedAt: now });
  list.resolve([piece]);
  assert.deepEqual(await pending, []);
});

test("foreground revocation hides cached assignment metadata even without a new online list", async () => {
  const f = fixture(); await f.service.listAssignments({ session });
  await f.repo.markRevoked({ studentId: session.studentId, accessRef: item.accessRef, lastVerifiedAt: now });
  f.offline(); assert.deepEqual(await f.service.listAssignments({ session }), []);
  await assert.rejects(() => f.service.getAssignment({ session, assignmentId: "score-a" }));
});

test("account switch rejects an in-flight read before it can persist or return another account's result", async () => {
  const list = deferred(); let currentStudentId = "student-a"; let epoch = 0;
  const f = fixture();
  const service = createSecureDeliveryOfflineReadService({ onlineReadService: { ...f.online, listPieces: () => list.promise },
    offlineRepository: f.repo, connectivityPort: { getState: () => "ONLINE" },
    isSessionCurrent: (value) => value.studentId === currentStudentId, getSessionEpoch: () => epoch });
  const pending = service.listPieces({ session }); const rejected = assert.rejects(pending);
  await new Promise((r) => setTimeout(r, 0)); currentStudentId = "student-b"; epoch++;
  list.resolve([piece]); await rejected;
  assert.deepEqual(await f.repo.listActivePieceManifests({ studentId: "student-a" }), []);
});

test("confirmed Piece revocation remains hidden in this session if local graph persistence aborts", async () => {
  const f = fixture(); await f.service.listPieces({ session });
  f.repo = { ...f.repo, async revokePieceAccess() { throw new Error("local write aborted"); } };
  f.online.listPieces = async () => [];
  let connection = "ONLINE";
  const transitioning = createSecureDeliveryOfflineReadService({ onlineReadService: f.online, offlineRepository: f.repo,
    connectivityPort: { getState: () => connection }, secureDeliveryStatusService: f.status });
  await transitioning.listPieces({ session }); connection = "OFFLINE";
  assert.deepEqual(await transitioning.listPieces({ session }), []);
});

test("online Piece SCORE opening survives a blocked or failed local database read", async () => {
  const f = fixture();
  const repo = { ...f.repo, async getActivePieceManifest() { throw new Error("IndexedDB upgrade blocked"); } };
  const service = createSecureDeliveryOfflineReadService({ onlineReadService: f.online, offlineRepository: repo,
    connectivityPort: { getState: () => "ONLINE" } });
  const opened = await service.getPieceScoreItem({ session, pieceAssignmentId: "piece-a" });
  assert.equal(opened.package.packageId, "pkg-a");
});
