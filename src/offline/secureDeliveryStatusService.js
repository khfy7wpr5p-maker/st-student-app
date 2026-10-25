import {
  createSecureDeliveryAssignmentRow,
} from "../contracts/secureDeliveryAssignment.js";
import {
  createStudentPieceManifest,
} from "../contracts/pieceAssignment.js";
import {
  createPracticeAccessRef,
} from "../practice/practiceAccessRef.js";
import {
  SecureDeliveryApiError,
} from "../providers/secureDelivery/secureDeliveryApiClient.js";

export function createSecureDeliveryStatusService({
  apiClient,
  isSessionCurrent = () => true,
  getSessionEpoch = () => 0,
} = {}) {
  if (
    typeof apiClient?.getStudentAssignment !==
    "function"
  ) {
    throw new TypeError(
      "Secure Delivery API client is incomplete",
    );
  }

  async function getPieceStatus({
    pieceAssignmentId,
  } = {}) {
    if (
      typeof pieceAssignmentId !== "string" ||
      pieceAssignmentId.trim().length === 0
    ) {
      throw new TypeError(
        "pieceAssignmentId must be a non-empty string",
      );
    }

    if (
      typeof apiClient?.getStudentPiece !==
      "function"
    ) {
      throw new TypeError(
        "Secure Delivery Piece API client is incomplete",
      );
    }

    const id = pieceAssignmentId.trim();

    try {
      const piece =
        createStudentPieceManifest(
          await apiClient.getStudentPiece(id),
        );

      if (
        piece.pieceAssignmentId !== id
      ) {
        throw new Error(
          "Piece identity mismatch",
        );
      }

      return Object.freeze({
        state: "ACTIVE",
        piece,
      });
    } catch (error) {
      if (
        error instanceof
          SecureDeliveryApiError &&
        error.status === 404 &&
        error.code === "NOT_FOUND"
      ) {
        return Object.freeze({
          state: "REVOKED",
        });
      }

      throw error;
    }
  }

  async function getAccessStatus({
      accessRef,
    } = {}) {
      const ref =
        createPracticeAccessRef(
          accessRef,
        );

      if (
        ref.kind !==
        "SECURE_DELIVERY"
      ) {
        throw new TypeError(
          "Secure Delivery access ref required",
        );
      }

      try {
        const row =
          createSecureDeliveryAssignmentRow(
            await apiClient
              .getStudentAssignment(
                ref.deliveryId,
              ),
          );

        if (
          row.deliveryId !==
            ref.deliveryId ||
          row.assignmentId !==
            ref.deliveryId
        ) {
          throw new Error(
            "assignment identity mismatch",
          );
        }

        return Object.freeze({
          state: "ACTIVE",
          packageId:
            row.packageId,
        });
      } catch (error) {
        if (
          error instanceof
            SecureDeliveryApiError &&
          error.status === 404 &&
          error.code === "NOT_FOUND"
        ) {
          return Object.freeze({
            state: "REVOKED",
          });
        }

        throw error;
      }
  }

  const pending = new Map();
  function singleFlight(kind, args, read) {
    const epoch = getSessionEpoch();
    const current = () => (args.session === undefined || isSessionCurrent(args.session)) && epoch === getSessionEpoch();
    const key = JSON.stringify([args.session?.studentId ?? null, epoch, kind,
      kind === "piece" ? args.pieceAssignmentId : args.accessRef]);
    if (pending.has(key)) return pending.get(key);
    const result = Promise.resolve().then(() => {
      if (!current()) throw new Error("stale offline session");
      return read(args);
    }).then((value) => {
      if (!current()) throw new Error("stale offline session");
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  }

  return Object.freeze({
    getPieceStatus: (args = {}) => singleFlight("piece", args, getPieceStatus),
    getAccessStatus: (args = {}) => singleFlight("access", args, getAccessStatus),
  });
}
