import {
  createStudentPieceManifest,
} from "../contracts/pieceAssignment.js";
import {
  OFFLINE_ACCESS_STATES,
} from "./offlineRecord.js";

function requiredText(value, name) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `${name} must be a non-empty string`,
    );
  }
  return value.trim();
}

export function createPieceOfflineRecord({
  studentId,
  piece,
  cachedAt,
  lastVerifiedAt,
  accessState =
    OFFLINE_ACCESS_STATES.ACTIVE,
} = {}) {
  if (
    !Object.values(
      OFFLINE_ACCESS_STATES,
    ).includes(accessState)
  ) {
    throw new TypeError(
      "Piece offline accessState is invalid",
    );
  }

  const manifest =
    createStudentPieceManifest(piece);

  return Object.freeze({
    studentId: requiredText(
      studentId,
      "studentId",
    ),
    pieceAssignmentId:
      manifest.pieceAssignmentId,
    piece: manifest,
    cachedAt: requiredText(
      cachedAt,
      "cachedAt",
    ),
    lastVerifiedAt: requiredText(
      lastVerifiedAt,
      "lastVerifiedAt",
    ),
    accessState,
  });
}
