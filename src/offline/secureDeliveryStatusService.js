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

  return Object.freeze({
    getPieceStatus,

    async getAccessStatus({
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
    },
  });
}
