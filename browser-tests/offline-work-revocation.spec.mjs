import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, webkit } from "playwright";
import { startRepositoryStaticServer } from "./support/static-server.mjs";

test("removed Piece stays inaccessible offline after list refresh and IndexedDB reopen", { timeout: 90_000 }, async () => {
  const server = await startRepositoryStaticServer({ htmlRoutes: {
    "/__offline-revocation__/": '<!doctype html><html><head><base href="/"></head><body></body></html>',
  } });
  let browser;
  try {
    browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? "chromium"]).launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${server.baseUrl}/__offline-revocation__/`);
    const onlineResult = await page.evaluate(async () => {
      const { createIndexedDbOfflineRepository } = await import("/src/offline/indexedDbOfflineRepository.js");
      const { createSecureDeliveryOfflineReadService } = await import("/src/offline/secureDeliveryOfflineReadService.js");
      const { createSecureDeliveryStatusService } = await import("/src/offline/secureDeliveryStatusService.js");
      const { SecureDeliveryApiError } = await import("/src/providers/secureDelivery/secureDeliveryApiClient.js");
      const { createBrowserConnectivityPort } = await import("/src/offline/connectivityPort.js");
      const { makeApprovedPracticePackage } = await import("/test/support/practiceFixtures.js");
      const now = "2026-10-25T10:00:00Z";
      const session = { studentId: "synthetic-offline-student" };
      const piece = { schemaVersion: "1.0.0", pieceAssignmentId: "piece-a", pieceId: "work-a", arrangementId: "arr-a",
        title: "Etüd", teacherNote: "", state: "ACTIVE", assignedAt: now,
        contentRefs: { scoreAssignmentId: "score-a", chordAssignmentIds: [] } };
      const item = { accessRef: { kind: "SECURE_DELIVERY", deliveryId: "score-a" }, practiceType: "SCORE",
        package: makeApprovedPracticePackage({ packageId: "pkg-a", scope: "student_private", recipientStudentId: "server-student-a" }) };
      let removed = false;
      const repo = createIndexedDbOfflineRepository({ indexedDB });
      const service = createSecureDeliveryOfflineReadService({ offlineRepository: repo,
        connectivityPort: createBrowserConnectivityPort(),
        onlineReadService: { async listPoolItems() { return []; }, async getPoolItem() {}, async listAssignments() { return []; },
          async getAssignment() {}, async getScorePracticeItem() { return item; }, async getChordBoardPracticeItem() {},
          async listPieces() { return removed ? [] : [piece]; }, async getPiece() { return piece; },
          async getPieceScoreItem() { return item; }, async listPieceChordItems() { return []; } },
        secureDeliveryStatusService: createSecureDeliveryStatusService({ apiClient: {
          async getStudentAssignment() {}, async getStudentPiece() {
            if (removed) throw new SecureDeliveryApiError({ status: 404, code: "NOT_FOUND", message: "removed" });
            return piece;
          },
        } }),
      });
      await service.listPieces({ session }); await service.getPieceScoreItem({ session, pieceAssignmentId: "piece-a" });
      removed = true;
      const rows = await service.listPieces({ session });
      globalThis.offlineRevocationFixture = { service, session, createIndexedDbOfflineRepository };
      return rows.length;
    });
    assert.equal(onlineResult, 0);
    await page.context().setOffline(true);
    const result = await page.evaluate(async () => {
      const { service, session, createIndexedDbOfflineRepository } = globalThis.offlineRevocationFixture;
      const rows = await service.listPieces({ session });
      let opened = false;
      try { await service.getPieceScoreItem({ session, pieceAssignmentId: "piece-a" }); opened = true; } catch {}
      const reopened = createIndexedDbOfflineRepository({ indexedDB });
      return { online: navigator.onLine, rows: rows.length, opened,
        pieces: (await reopened.listActivePieceManifests({ studentId: session.studentId })).length,
        child: await reopened.getActiveByAccessRef({ studentId: session.studentId,
          accessRef: { kind: "SECURE_DELIVERY", deliveryId: "score-a" } }) };
    });
    assert.deepEqual(result, { online: false, rows: 0, opened: false, pieces: 0, child: null });
  } finally {
    await browser?.close(); await server.close();
  }
});
