import { getAuthenticatedStudentId } from "../auth/session.js";
import { OFFLINE_ACCESS_STATES } from "./offlineRecord.js";

export const SYNC_STATES = Object.freeze({
  IDLE: "IDLE",
  SYNCING: "SYNCING",
  SYNCED: "SYNCED",
  SYNC_ERROR: "SYNC_ERROR",
});

function requireStudentId(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("authenticated student session required");
  }

  return studentId;
}

function hasActivePackageStatus(status) {
  return (
    status !== null &&
    typeof status === "object" &&
    status.state === "ACTIVE" &&
    typeof status.packageId === "string" &&
    status.packageId.trim().length > 0
  );
}

function activePublicationGroups(records) {
  const groups = new Map();

  for (const record of records) {
    if (record.accessState === OFFLINE_ACCESS_STATES.REVOKED) {
      continue;
    }

    const current = groups.get(record.publicationId);

    if (current === undefined) {
      groups.set(record.publicationId, {
        publicationId: record.publicationId,
        scope: record.scope,
        records: [record],
      });
      continue;
    }

    if (current.scope !== record.scope) {
      throw new Error("cached publication scope mismatch");
    }

    current.records.push(record);
  }

  return [...groups.values()];
}

export function createForegroundSyncCoordinator({
  offlineRepository,
  publicationStatusService,
  clock = () => new Date().toISOString(),
}) {
  if (
    offlineRepository === null ||
    typeof offlineRepository !== "object"
  ) {
    throw new TypeError("offlineRepository is required");
  }

  if (
    publicationStatusService === null ||
    typeof publicationStatusService?.getPublicationStatus !== "function"
  ) {
    throw new TypeError("publicationStatusService is required");
  }

  return Object.freeze({
    async sync({ session }) {
      const studentId = requireStudentId(session);
      const records = await offlineRepository.listAllForStudent({
        studentId,
      });
      const groups = activePublicationGroups(records);

      let checked = 0;
      let revoked = 0;
      let failed = 0;

      for (const group of groups) {
        checked += 1;

        try {
          const status =
            await publicationStatusService.getPublicationStatus({
              session,
              publicationId: group.publicationId,
              scope: group.scope,
            });

          const verifiedAt = clock();

          if (status?.state === "REVOKED") {
            await offlineRepository.markRevoked({
              studentId,
              publicationId: group.publicationId,
              lastVerifiedAt: verifiedAt,
            });
            revoked += 1;
            continue;
          }

          if (hasActivePackageStatus(status)) {
            const cachedMatch = group.records.find(
              (record) => record.packageId === status.packageId,
            );

            if (cachedMatch !== undefined) {
              await offlineRepository.markVerifiedActive({
                studentId,
                publicationId: group.publicationId,
                packageId: cachedMatch.packageId,
                lastVerifiedAt: verifiedAt,
              });
            }

            continue;
          }

          failed += 1;
        } catch {
          failed += 1;
        }
      }

      return Object.freeze({
        state:
          failed > 0 ? SYNC_STATES.SYNC_ERROR : SYNC_STATES.SYNCED,
        checked,
        revoked,
        failed,
      });
    },
  });
}
