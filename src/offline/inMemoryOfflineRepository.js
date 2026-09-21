import {
  OFFLINE_ACCESS_STATES,
  createOfflineRecord,
} from "./offlineRecord.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function requireStudentId(studentId) {
  if (!hasText(studentId)) {
    throw new TypeError("studentId must be a non-empty string");
  }
}

function requirePublicationId(publicationId) {
  if (!hasText(publicationId)) {
    throw new TypeError("publicationId must be a non-empty string");
  }
}

const cacheKey = ({ studentId, publicationId, packageId }) =>
  `${studentId}\u0000${publicationId}\u0000${packageId}`;

function immutablePackageMatches(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createInMemoryOfflineRepository() {
  const records = new Map();

  function matchingRecords(studentId, publicationId) {
    return [...records.values()].filter(
      (record) =>
        record.studentId === studentId &&
        record.publicationId === publicationId,
    );
  }

  function replaceRecord(current, accessState, lastVerifiedAt) {
    return createOfflineRecord({
      studentId: current.studentId,
      deliveryItem: {
        publication: current.publication,
        package: current.package,
      },
      cachedAt: current.cachedAt,
      lastVerifiedAt,
      accessState,
    });
  }

  return Object.freeze({
    async putAuthorized({
      studentId,
      deliveryItem,
      cachedAt,
      lastVerifiedAt,
    }) {
      const incoming = createOfflineRecord({
        studentId,
        deliveryItem,
        cachedAt,
        lastVerifiedAt,
        accessState: OFFLINE_ACCESS_STATES.ACTIVE,
      });

      const conflicts = matchingRecords(studentId, incoming.publicationId);
      const otherPackage = conflicts.find(
        (record) => record.packageId !== incoming.packageId,
      );

      if (otherPackage) {
        throw new Error(
          "student publication is already bound to a different package",
        );
      }

      const key = cacheKey(incoming);
      const existing = records.get(key);

      if (existing) {
        if (!immutablePackageMatches(existing.package, incoming.package)) {
          throw new Error("immutable package snapshot conflict");
        }

        const refreshed = createOfflineRecord({
          studentId: existing.studentId,
          deliveryItem: {
            publication: existing.publication,
            package: existing.package,
          },
          cachedAt: incoming.cachedAt,
          lastVerifiedAt: incoming.lastVerifiedAt,
          accessState: existing.accessState,
        });
        records.set(key, refreshed);
        return refreshed;
      }

      records.set(key, incoming);
      return incoming;
    },

    async listActiveForStudent({ studentId, scope = null }) {
      requireStudentId(studentId);

      return [...records.values()].filter(
        (record) =>
          record.studentId === studentId &&
          record.accessState === OFFLINE_ACCESS_STATES.ACTIVE &&
          (scope === null || record.scope === scope),
      );
    },

    async listAllForStudent({ studentId }) {
      requireStudentId(studentId);
      return [...records.values()].filter(
        (record) => record.studentId === studentId,
      );
    },

    async getActiveByPublicationId({ studentId, publicationId }) {
      requireStudentId(studentId);
      requirePublicationId(publicationId);

      return (
        matchingRecords(studentId, publicationId).find(
          (record) => record.accessState === OFFLINE_ACCESS_STATES.ACTIVE,
        ) ?? null
      );
    },

    async markVerifiedActive({
      studentId,
      publicationId,
      lastVerifiedAt,
    }) {
      requireStudentId(studentId);
      requirePublicationId(publicationId);

      const current = matchingRecords(studentId, publicationId)[0] ?? null;

      if (current === null) {
        return null;
      }

      if (current.accessState === OFFLINE_ACCESS_STATES.REVOKED) {
        return current;
      }

      const replacement = replaceRecord(
        current,
        OFFLINE_ACCESS_STATES.ACTIVE,
        lastVerifiedAt,
      );
      records.set(cacheKey(replacement), replacement);
      return replacement;
    },

    async markRevoked({ studentId, publicationId, lastVerifiedAt }) {
      requireStudentId(studentId);
      requirePublicationId(publicationId);

      const current = matchingRecords(studentId, publicationId)[0] ?? null;

      if (current === null) {
        return null;
      }

      const replacement = replaceRecord(
        current,
        OFFLINE_ACCESS_STATES.REVOKED,
        lastVerifiedAt,
      );
      records.set(cacheKey(replacement), replacement);
      return replacement;
    },
  });
}
