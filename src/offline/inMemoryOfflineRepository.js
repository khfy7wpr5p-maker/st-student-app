import {
  OFFLINE_ACCESS_STATES,
  createOfflineRecord,
} from "./offlineRecord.js";
import {
  createPracticeAccessRef,
  practiceAccessKey,
} from "../practice/practiceAccessRef.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function requireStudentId(studentId) {
  if (!hasText(studentId)) {
    throw new TypeError(
      "studentId must be a non-empty string",
    );
  }
}

function resolveAccessRef({
  accessRef,
  publicationId,
}) {
  if (accessRef !== undefined) {
    return createPracticeAccessRef(accessRef);
  }

  if (hasText(publicationId)) {
    return createPracticeAccessRef({
      kind: "PUBLICATION",
      publicationId,
    });
  }

  throw new TypeError(
    "accessRef or publicationId is required",
  );
}

function cacheKey({
  studentId,
  accessRef,
  packageId,
}) {
  const ref =
    createPracticeAccessRef(accessRef);

  const identity =
    ref.kind === "PUBLICATION"
      ? ref.publicationId
      : `SECURE_DELIVERY:${ref.deliveryId}`;

  return `${studentId}\u0000${identity}\u0000${packageId}`;
}

function immutablePackageMatches(
  left,
  right,
) {
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

function newestActivePerAccess(records) {
  const newestByAccess = new Map();

  for (const record of records) {
    if (
      record.accessState !==
      OFFLINE_ACCESS_STATES.ACTIVE
    ) {
      continue;
    }

    const current =
      newestByAccess.get(
        record.accessKey,
      ) ?? null;

    newestByAccess.set(
      record.accessKey,
      newestRecord(
        current === null
          ? [record]
          : [current, record],
      ),
    );
  }

  return [...newestByAccess.values()];
}

function recordInput(record) {
  if (
    record.accessRef.kind ===
    "SECURE_DELIVERY"
  ) {
    return {
      practiceItem: {
        accessRef: record.accessRef,
        practiceType:
          record.practiceType,
        package: record.package,
      },
    };
  }

  return {
    deliveryItem: {
      publication: record.publication,
      package: record.package,
    },
  };
}

export function createInMemoryOfflineRepository() {
  const records = new Map();

  function matchingRecords(
    studentId,
    accessRef,
  ) {
    const ref =
      createPracticeAccessRef(accessRef);
    const key = practiceAccessKey(ref);

    return [...records.values()].filter(
      (record) =>
        record.studentId === studentId &&
        record.accessKey === key,
    );
  }

  function replaceRecord(
    current,
    accessState,
    lastVerifiedAt,
  ) {
    return createOfflineRecord({
      studentId: current.studentId,
      ...recordInput(current),
      cachedAt: current.cachedAt,
      lastVerifiedAt,
      accessState,
    });
  }

  async function getActiveByAccessRef({
    studentId,
    accessRef,
  }) {
    requireStudentId(studentId);
    const ref =
      createPracticeAccessRef(accessRef);

    return newestRecord(
      matchingRecords(
        studentId,
        ref,
      ).filter(
        (record) =>
          record.accessState ===
          OFFLINE_ACCESS_STATES.ACTIVE,
      ),
    );
  }

  return Object.freeze({
    async putAuthorized({
      studentId,
      deliveryItem,
      practiceItem,
      cachedAt,
      lastVerifiedAt,
    }) {
      const incoming =
        createOfflineRecord({
          studentId,
          deliveryItem,
          practiceItem,
          cachedAt,
          lastVerifiedAt,
          accessState:
            OFFLINE_ACCESS_STATES.ACTIVE,
        });

      const conflicts =
        matchingRecords(
          studentId,
          incoming.accessRef,
        );

      const scopeConflict =
        conflicts.find(
          (record) =>
            record.scope !==
            incoming.scope,
        );

      if (scopeConflict) {
        throw new Error(
          "student access scope changed unexpectedly",
        );
      }

      const key = cacheKey(incoming);
      const existing =
        records.get(key);

      if (existing) {
        if (
          !immutablePackageMatches(
            existing.package,
            incoming.package,
          )
        ) {
          throw new Error(
            "immutable package snapshot conflict",
          );
        }

        const refreshed =
          createOfflineRecord({
            studentId:
              existing.studentId,
            ...recordInput(existing),
            cachedAt:
              incoming.cachedAt,
            lastVerifiedAt:
              incoming.lastVerifiedAt,
            accessState:
              existing.accessState,
          });

        records.set(key, refreshed);
        return refreshed;
      }

      records.set(key, incoming);
      return incoming;
    },

    async listActiveForStudent({
      studentId,
      scope = null,
    }) {
      requireStudentId(studentId);

      return newestActivePerAccess(
        [...records.values()].filter(
          (record) =>
            record.studentId ===
              studentId &&
            (
              scope === null ||
              record.scope === scope
            ),
        ),
      );
    },

    async listAllForStudent({
      studentId,
    }) {
      requireStudentId(studentId);

      return [...records.values()].filter(
        (record) =>
          record.studentId ===
          studentId,
      );
    },

    getActiveByAccessRef,

    async getActiveByPublicationId({
      studentId,
      publicationId,
    }) {
      return getActiveByAccessRef({
        studentId,
        accessRef: {
          kind: "PUBLICATION",
          publicationId,
        },
      });
    },

    async markVerifiedActive({
      studentId,
      accessRef,
      publicationId,
      packageId = null,
      lastVerifiedAt,
    }) {
      requireStudentId(studentId);
      const ref = resolveAccessRef({
        accessRef,
        publicationId,
      });

      if (
        packageId !== null &&
        !hasText(packageId)
      ) {
        throw new TypeError(
          "packageId must be null or a non-empty string",
        );
      }

      const matching =
        matchingRecords(
          studentId,
          ref,
        );

      const current =
        packageId === null
          ? newestRecord(
              matching.filter(
                (record) =>
                  record.accessState ===
                  OFFLINE_ACCESS_STATES.ACTIVE,
              ),
            )
          : matching.find(
              (record) =>
                record.packageId ===
                packageId,
            ) ?? null;

      if (current === null) {
        return null;
      }

      if (
        current.accessState ===
        OFFLINE_ACCESS_STATES.REVOKED
      ) {
        return current;
      }

      const replacement =
        replaceRecord(
          current,
          OFFLINE_ACCESS_STATES.ACTIVE,
          lastVerifiedAt,
        );

      records.set(
        cacheKey(replacement),
        replacement,
      );

      return replacement;
    },

    async markRevoked({
      studentId,
      accessRef,
      publicationId,
      lastVerifiedAt,
    }) {
      requireStudentId(studentId);
      const ref = resolveAccessRef({
        accessRef,
        publicationId,
      });

      const matching =
        matchingRecords(
          studentId,
          ref,
        );

      if (matching.length === 0) {
        return null;
      }

      const replacements =
        matching.map(
          (current) =>
            replaceRecord(
              current,
              OFFLINE_ACCESS_STATES.REVOKED,
              lastVerifiedAt,
            ),
        );

      for (
        const replacement
        of replacements
      ) {
        records.set(
          cacheKey(replacement),
          replacement,
        );
      }

      return newestRecord(
        replacements,
      );
    },
  });
}
