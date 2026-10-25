import {
  getAuthenticatedStudentId,
} from "../auth/session.js";
import {
  createPracticeAccessRef,
} from "../practice/practiceAccessRef.js";
import {
  OFFLINE_ACCESS_STATES,
} from "./offlineRecord.js";

export const SYNC_STATES = Object.freeze({
  IDLE: "IDLE",
  SYNCING: "SYNCING",
  SYNCED: "SYNCED",
  SYNC_ERROR: "SYNC_ERROR",
});

function requireStudentId(session) {
  const studentId =
    getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error(
      "authenticated student session required",
    );
  }

  return studentId;
}

function hasActivePackageStatus(
  status,
) {
  return (
    status !== null &&
    typeof status === "object" &&
    status.state === "ACTIVE" &&
    typeof status.packageId ===
      "string" &&
    status.packageId.trim().length >
      0
  );
}

function activeAccessGroups(records) {
  const groups = new Map();

  for (const record of records) {
    if (
      record.accessState ===
      OFFLINE_ACCESS_STATES.REVOKED
    ) {
      continue;
    }

    const accessRef =
      createPracticeAccessRef(
        record.accessRef,
      );

    if (
      typeof record.accessKey !==
        "string" ||
      record.accessKey.trim()
        .length === 0
    ) {
      throw new Error(
        "cached access key missing",
      );
    }

    const current =
      groups.get(
        record.accessKey,
      );

    if (
      current === undefined
    ) {
      groups.set(
        record.accessKey,
        {
          accessRef,
          scope: record.scope,
          records: [record],
        },
      );
      continue;
    }

    if (
      current.scope !==
      record.scope
    ) {
      throw new Error(
        "cached access scope mismatch",
      );
    }

    current.records.push(
      record,
    );
  }

  return [...groups.values()];
}

function pieceChildDeliveryIds(record) {
  const contentRefs =
    record?.piece?.contentRefs;
  const ids = [];

  if (
    typeof contentRefs
      ?.scoreAssignmentId ===
      "string" &&
    contentRefs.scoreAssignmentId
      .trim().length > 0
  ) {
    ids.push(
      contentRefs.scoreAssignmentId,
    );
  }

  for (
    const chordAssignmentId of
    contentRefs?.chordAssignmentIds ?? []
  ) {
    if (
      typeof chordAssignmentId ===
        "string" &&
      chordAssignmentId.trim()
        .length > 0
    ) {
      ids.push(chordAssignmentId);
    }
  }

  return [...new Set(ids)];
}

export function createForegroundSyncCoordinator({
  offlineRepository,
  publicationStatusService,
  secureDeliveryStatusService = null,
  getCachedAccessRefs = () => [],
  isSessionCurrent = () => true,
  getSessionEpoch = () => 0,
  clock = () =>
    new Date().toISOString(),
}) {
  if (
    offlineRepository === null ||
    typeof offlineRepository !==
      "object"
  ) {
    throw new TypeError(
      "offlineRepository is required",
    );
  }

  if (
    publicationStatusService ===
      null ||
    typeof publicationStatusService
      ?.getPublicationStatus !==
      "function"
  ) {
    throw new TypeError(
      "publicationStatusService is required",
    );
  }

  if (
    secureDeliveryStatusService !==
      null &&
    typeof secureDeliveryStatusService
      ?.getAccessStatus !==
      "function"
  ) {
    throw new TypeError(
      "secureDeliveryStatusService must provide getAccessStatus()",
    );
  }

  async function statusForGroup(
    group,
    session,
  ) {
    if (
      group.accessRef.kind ===
      "PUBLICATION"
    ) {
      return publicationStatusService
        .getPublicationStatus({
          session,
          publicationId:
            group.accessRef
              .publicationId,
          scope: group.scope,
        });
    }

    if (
      secureDeliveryStatusService ===
      null
    ) {
      throw new Error(
        "Secure Delivery status service unavailable",
      );
    }

    return secureDeliveryStatusService
      .getAccessStatus({
        session,
        accessRef:
          group.accessRef,
      });
  }

  const pending = new Map();
  async function synchronize({ session }) {
      const epoch = getSessionEpoch();
      const current = () => isSessionCurrent(session) && getSessionEpoch() === epoch;
      const studentId =
        requireStudentId(session);
      const records =
        await offlineRepository
          .listAllForStudent({
            studentId,
          });
      const groups = activeAccessGroups(records);
      const known = new Set(groups.map((group) => JSON.stringify(group.accessRef)));
      for (const accessRef of await getCachedAccessRefs({ session })) {
        const ref = createPracticeAccessRef(accessRef);
        if (known.has(JSON.stringify(ref))) continue;
        if (typeof offlineRepository.isAccessRevoked === "function" &&
            await offlineRepository.isAccessRevoked({ studentId, accessRef: ref })) continue;
        known.add(JSON.stringify(ref));
        groups.push({ accessRef: ref, scope: "student_private", records: [] });
      }
      const pieceRecords =
        typeof offlineRepository
          .listActivePieceManifests === "function"
          ? await offlineRepository
              .listActivePieceManifests({
                studentId,
              })
          : [];

      let checked = 0;
      let revoked = 0;
      let failed = 0;

      for (
        const group of groups
      ) {
        if (!current()) { failed += 1; break; }
        checked += 1;

        try {
          const status =
            await statusForGroup(
              group,
              session,
            );

          if (!current()) { failed += 1; break; }
          const verifiedAt = clock();

          if (
            status?.state ===
            "REVOKED"
          ) {
            await offlineRepository
              .markRevoked({
                studentId,
                accessRef:
                  group.accessRef,
                lastVerifiedAt:
                  verifiedAt,
              });
            revoked += 1;
            continue;
          }

          if (
            hasActivePackageStatus(
              status,
            )
          ) {
            const cachedMatch =
              group.records.find(
                (record) =>
                  record.packageId ===
                  status.packageId,
              );

            if (
              cachedMatch !==
              undefined
            ) {
              await offlineRepository
                .markVerifiedActive({
                  studentId,
                  accessRef:
                    group.accessRef,
                  packageId:
                    cachedMatch
                      .packageId,
                  lastVerifiedAt:
                    verifiedAt,
                });
            }

            continue;
          }

          failed += 1;
        } catch {
          failed += 1;
        }
      }

      for (
        const record of pieceRecords
      ) {
        if (!current()) { failed += 1; break; }
        checked += 1;

        try {
          if (
            secureDeliveryStatusService === null ||
            typeof secureDeliveryStatusService
              ?.getPieceStatus !== "function" ||
            typeof offlineRepository
              .markRevoked !== "function" ||
            typeof offlineRepository
              .markPieceManifestRevoked !== "function" ||
            typeof offlineRepository
              .putPieceManifest !== "function"
          ) {
            failed += 1;
            continue;
          }

          const status =
            await secureDeliveryStatusService
              .getPieceStatus({
                session,
                pieceAssignmentId:
                  record.pieceAssignmentId,
              });
          if (!current()) { failed += 1; break; }
          const verifiedAt = clock();

          if (
            status?.state ===
            "REVOKED"
          ) {
            if (typeof offlineRepository.revokePieceAccess === "function") {
              await offlineRepository.revokePieceAccess({ studentId,
                pieceAssignmentId: record.pieceAssignmentId, lastVerifiedAt: verifiedAt });
              revoked += 1;
              continue;
            }
            for (
              const deliveryId of
              pieceChildDeliveryIds(
                record,
              )
            ) {
              await offlineRepository
                .markRevoked({
                  studentId,
                  accessRef: {
                    kind:
                      "SECURE_DELIVERY",
                    deliveryId,
                  },
                  lastVerifiedAt:
                    verifiedAt,
                });
            }

            await offlineRepository
              .markPieceManifestRevoked({
                studentId,
                pieceAssignmentId:
                  record.pieceAssignmentId,
                lastVerifiedAt:
                  verifiedAt,
              });
            revoked += 1;
            continue;
          }

          if (
            status?.state === "ACTIVE" &&
            status.piece
              ?.pieceAssignmentId ===
              record.pieceAssignmentId
          ) {
            await offlineRepository
              .putPieceManifest({
                studentId,
                piece: status.piece,
                cachedAt:
                  record.cachedAt,
                lastVerifiedAt:
                  verifiedAt,
              });
            continue;
          }

          failed += 1;
        } catch {
          failed += 1;
        }
      }

      return Object.freeze({
        state:
          failed > 0
            ? SYNC_STATES.SYNC_ERROR
            : SYNC_STATES.SYNCED,
        checked,
        revoked,
        failed,
      });
  }

  return Object.freeze({
    sync({ session }) {
      const studentId = requireStudentId(session);
      const key = `${studentId}\u0000${getSessionEpoch()}`;
      if (pending.has(key)) return pending.get(key);
      const result = synchronize({ session }).finally(() => pending.delete(key));
      pending.set(key, result);
      return result;
    },
  });
}
