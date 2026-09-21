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

function newestRecord(records) {
  return records.reduce((newest, record) => {
    if (newest === null) {
      return record;
    }

    if (record.cachedAt > newest.cachedAt) {
      return record;
    }

    if (
      record.cachedAt === newest.cachedAt &&
      record.packageId > newest.packageId
    ) {
      return record;
    }

    return newest;
  }, null);
}

function newestActivePerPublication(records) {
  const newestByPublication = new Map();

  for (const record of records) {
    if (record.accessState !== OFFLINE_ACCESS_STATES.ACTIVE) {
      continue;
    }

    const current = newestByPublication.get(record.publicationId) ?? null;
    newestByPublication.set(
      record.publicationId,
      newestRecord(current === null ? [record] : [current, record]),
    );
  }

  return [...newestByPublication.values()];
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
      const scopeConflict = conflicts.find(
        (record) => record.scope !== incoming.scope,
      );

      if (scopeConflict) {
        throw new Error("student publication scope changed unexpectedly");
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

      return newestActivePerPublication(
        [...records.values()].filter(
          (record) =>
            record.studentId === studentId &&
            (scope === null || record.scope === scope),
        ),
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

      return newestRecord(
        matchingRecords(studentId, publicationId).filter(
          (record) => record.accessState === OFFLINE_ACCESS_STATES.ACTIVE,
        ),
      );
    },

    async markVerifiedActive({
      studentId,
      publicationId,
      packageId = null,
      lastVerifiedAt,
    }) {
      requireStudentId(studentId);
      requirePublicationId(publicationId);

      if (packageId !== null && !hasText(packageId)) {
        throw new TypeError("packageId must be null or a non-empty string");
      }

      const matching = matchingRecords(studentId, publicationId);
      const current =
        packageId === null
          ? newestRecord(
              matching.filter(
                (record) =>
                  record.accessState === OFFLINE_ACCESS_STATES.ACTIVE,
              ),
            )
          : matching.find((record) => record.packageId === packageId) ?? null;

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

      const matching = matchingRecords(studentId, publicationId);

      if (matching.length === 0) {
        return null;
      }

      const replacements = matching.map((current) =>
        replaceRecord(
          current,
          OFFLINE_ACCESS_STATES.REVOKED,
          lastVerifiedAt,
        ),
      );

      for (const replacement of replacements) {
        records.set(cacheKey(replacement), replacement);
      }

      return newestRecord(replacements);
    },
  });
}
