import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";

let server;
let baseUrl;

before(async () => {
  server = await startRepositoryStaticServer();
  baseUrl = server.baseUrl;
});

after(async () => {
  if (server) {
    await server.close();
  }
});

test(
  "SES-162 renders 50 compact work titles and restores focus to the returned Piece",
  { timeout: 60_000 },
  async () => {
    const browserName = process.env.ST_BROWSER ?? "chromium";
    const browserType = { chromium, webkit }[browserName];
    assert.ok(browserType, `Unsupported ST_BROWSER: ${browserName}`);

    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(`${baseUrl}/index.html`);
      assert.equal(response.status(), 200);

      const result = await page.evaluate(async () => {
        const [{ renderStudentApp }, { createPieceWorkspaceViewModel }, { STUDENT_APP_SCREENS }] =
          await Promise.all([
            import("/src/ui/renderStudentApp.js"),
            import("/src/ui/pieceWorkspaceViewModel.js"),
            import("/src/ui/studentAppController.js"),
          ]);

        const makePiece = (index, title = `Etüt ${index}`) => ({
          itemKind: "PIECE",
          pieceAssignmentId: `piece-${index}`,
          pieceId: `work-${index}`,
          arrangementId: `arr-${index}`,
          title,
          teacherNote: "",
          state: "ACTIVE",
          assignedAt: "2026-10-03T12:00:00Z",
          contentRefs: {
            scoreAssignmentId: `score-${index}`,
            chordAssignmentIds: [],
          },
        });

        const returnedPiece = makePiece(2, "Samanyolu");
        const workspace = createPieceWorkspaceViewModel({
          piece: returnedPiece,
          scorePractice: {
            capabilities: {
              guitarTab: "UNAVAILABLE",
            },
          },
          chordItems: [],
          returnContext: {
            folderState: "ACTIVE",
            scrollPosition: 360,
          },
        });
        const items = [
          makePiece(1, "Samanyolu"),
          returnedPiece,
          ...Array.from({ length: 48 }, (_, index) => makePiece(index + 3)),
        ];

        document.body.innerHTML = renderStudentApp({
          student08: true,
          screen: STUDENT_APP_SCREENS.MY_WORK,
          session: { studentId: "student-a" },
          assignmentState: "ACTIVE",
          items,
          practice: null,
          returnContext: workspace.returnContext,
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        const controls = [...document.querySelectorAll('[data-action="open-piece"]')];
        return {
          count: controls.length,
          activePieceAssignmentId:
            document.activeElement?.dataset?.pieceAssignmentId ?? null,
          labels: controls.slice(0, 2).map((control) => control.getAttribute("aria-label")),
          visibleTitles: controls.slice(0, 2).map((control) => control.textContent.trim()),
        };
      });

      assert.deepEqual(pageErrors, []);
      assert.equal(result.count, 50);
      assert.equal(result.activePieceAssignmentId, "piece-2");
      assert.deepEqual(result.labels, [
        "Samanyolu, aynı adlı çalışma 1/2",
        "Samanyolu, aynı adlı çalışma 2/2",
      ]);
      assert.deepEqual(result.visibleTitles, ["Samanyolu", "Samanyolu"]);
    } finally {
      await browser.close();
    }
  },
);
