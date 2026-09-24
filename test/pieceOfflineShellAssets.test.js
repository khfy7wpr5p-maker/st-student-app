import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const REQUIRED_PIECE_RUNTIME_MODULES = [
  "./src/config/secureDeliveryConfig.js",
  "./src/ui/student08Composition.js",
  "./src/providers/secureDelivery/secureDeliveryApiClient.js",
  "./src/sharing/secureDeliveryStudent08ReadService.js",
  "./src/contracts/privateAssignment.js",
  "./src/contracts/studentPoolView.js",
  "./src/contracts/pieceAssignment.js",
  "./src/contracts/secureDeliveryAssignment.js",
  "./src/contracts/secureDeliveryPackage.js",
  "./src/contracts/studentChordBoardPackage.js",
  "./src/practice/practiceAccessRef.js",
  "./src/ui/chordBoardViewModel.js",
  "./src/ui/chordDiagramSvg.js",
  "./src/ui/renderChordBoardWorkspace.js",
  "./src/ui/pieceWorkspaceViewModel.js",
  "./src/ui/renderPieceWorkspace.js",
  "./src/offline/secureDeliveryOfflineReadService.js",
  "./src/offline/secureDeliveryStatusService.js",
  "./src/offline/pieceOfflineRecord.js",
];

test("service worker pins the Piece Workspace browser module graph for warm offline reload", async () => {
  const source = await readFile(
    new URL("../service-worker.js", import.meta.url),
    "utf8",
  );

  for (const asset of REQUIRED_PIECE_RUNTIME_MODULES) {
    assert.equal(
      source.includes(`"${asset}"`),
      true,
      asset,
    );
  }

  assert.doesNotMatch(
    source,
    /practicePackages|recipientStudentId.*SHELL_ASSETS|accessToken|refreshToken/i,
  );
});
