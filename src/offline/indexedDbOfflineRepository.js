import {
  OFFLINE_ACCESS_STATES,
  createOfflineRecord,
} from "./offlineRecord.js";

const STORE_NAME = "practicePackages";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

const cacheKey = ({ studentId, publicationId, packageId }) =>
  `${studentId}\u0000${publicationId}\u0000${packageId}`;

const studentScopeKey = ({ studentId, scope }) =>
  `${studentId}\u0000${scope}`;

const studentPublicationKey = ({ studentId, publicationId }) =>
  `${studentId}\u0000${publicationId}`;

function requireText(value, name) {
  if (!hasText(value)) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function toStorageRecord(record) {
  return {
    ...structuredClone(record),
    cacheKey: cacheKey(record),
    studentScopeKey: studentScopeKey(record),
    studentPublicationKey: studentPublicationKey(record),
  };
}

function fromStorageRecord(stored) {
  if (stored === undefined || stored === null) {
    return null;
  }

  return createOfflineRecord({
    studentId: stored.studentId,
    deliveryItem: {
      publication: stored.publication,
      package: stored.package,
    },
    cachedAt: stored.cachedAt,
    lastVerifiedAt: stored.lastVerifiedAt,
    accessState: stored.accessState,
  });
}

function samePackage(left, right) {
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
    if (
      record === null ||
      record.accessState !== OFFLINE_ACCESS_STATES.ACTIVE
    ) {
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

export function createIndexedDbOfflineRepository({
  indexedDB,
  dbName = "st-student-app",
  dbVersion = 1,
}) {
  if (indexedDB === null || typeof indexedDB?.open !== "function") {
    throw new Error("IndexedDB is unavailable");
  }

  let dbPromise = null;

  function openDatabase() {
    if (dbPromise !== null) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        let store;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, {
            keyPath: "cacheKey",
          });
        } else {
          store = request.transaction.objectStore(STORE_NAME);
        }

        if (!store.indexNames.contains("byStudent")) {
          store.createIndex("byStudent", "studentId", { unique: false });
        }
        if (!store.indexNames.contains("byStudentScope")) {
          store.createIndex("byStudentScope", "studentScopeKey", {
            unique: false,
          });
        }
        if (!store.indexNames.contains("byStudentPublication")) {
          store.createIndex(
            "byStudentPublication",
            "studentPublicationKey",
            { unique: false },
          );
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error("IndexedDB open failed"));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error("IndexedDB open blocked"));
      };
    });

    return dbPromise;
  }

  async function withStore(mode, operation) {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);

    try {
      const result = await operation(store);
      await done;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Transaction may already be complete/aborted.
      }
      try {
        await done;
      } catch {
        // Preserve the original bounded repository error.
      }
      throw error;
    }
  }

  async function recordsForPublication(store, studentId, publicationId) {
    return requestResult(
      store
        .index("byStudentPublication")
        .getAll(studentPublicationKey({ studentId, publicationId })),
    );
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

      return withStore("readwrite", async (store) => {
        const existingRecords = await recordsForPublication(
          store,
          incoming.studentId,
          incoming.publicationId,
        );

        const scopeConflict = existingRecords.find(
          (record) => record.scope !== incoming.scope,
        );

        if (scopeConflict) {
          throw new Error("student publication scope changed unexpectedly");
        }

        const exact = existingRecords.find(
          (record) => record.packageId === incoming.packageId,
        );

        let next = incoming;

        if (exact) {
          if (!samePackage(exact.package, incoming.package)) {
            throw new Error("immutable package snapshot conflict");
          }

          next = createOfflineRecord({
            studentId: exact.studentId,
            deliveryItem: {
              publication: exact.publication,
              package: exact.package,
            },
            cachedAt: incoming.cachedAt,
            lastVerifiedAt: incoming.lastVerifiedAt,
            accessState: exact.accessState,
          });
        }

        await requestResult(store.put(toStorageRecord(next)));
        return next;
      });
    },

    async listActiveForStudent({ studentId, scope = null }) {
      requireText(studentId, "studentId");

      return withStore("readonly", async (store) => {
        const stored =
          scope === null
            ? await requestResult(store.index("byStudent").getAll(studentId))
            : await requestResult(
                store
                  .index("byStudentScope")
                  .getAll(studentScopeKey({ studentId, scope })),
              );

        return newestActivePerPublication(
          stored.map(fromStorageRecord),
        );
      });
    },

    async listAllForStudent({ studentId }) {
      requireText(studentId, "studentId");

      return withStore("readonly", async (store) => {
        const stored = await requestResult(
          store.index("byStudent").getAll(studentId),
        );
        return stored.map(fromStorageRecord);
      });
    },

    async getActiveByPublicationId({ studentId, publicationId }) {
      requireText(studentId, "studentId");
      requireText(publicationId, "publicationId");

      return withStore("readonly", async (store) => {
        const stored = await recordsForPublication(
          store,
          studentId,
          publicationId,
        );
        return newestRecord(
          stored
            .map(fromStorageRecord)
            .filter(
              (record) =>
                record !== null &&
                record.accessState === OFFLINE_ACCESS_STATES.ACTIVE,
            ),
        );
      });
    },

    async markVerifiedActive({
      studentId,
      publicationId,
      lastVerifiedAt,
    }) {
      requireText(studentId, "studentId");
      requireText(publicationId, "publicationId");

      return withStore("readwrite", async (store) => {
        const stored = await recordsForPublication(
          store,
          studentId,
          publicationId,
        );
        const current = stored[0];

        if (current === undefined) {
          return null;
        }

        if (current.accessState === OFFLINE_ACCESS_STATES.REVOKED) {
          return fromStorageRecord(current);
        }

        const replacement = createOfflineRecord({
          studentId: current.studentId,
          deliveryItem: {
            publication: current.publication,
            package: current.package,
          },
          cachedAt: current.cachedAt,
          lastVerifiedAt,
          accessState: OFFLINE_ACCESS_STATES.ACTIVE,
        });
        await requestResult(store.put(toStorageRecord(replacement)));
        return replacement;
      });
    },

    async markRevoked({ studentId, publicationId, lastVerifiedAt }) {
      requireText(studentId, "studentId");
      requireText(publicationId, "publicationId");

      return withStore("readwrite", async (store) => {
        const stored = await recordsForPublication(
          store,
          studentId,
          publicationId,
        );
        const current = stored[0];

        if (current === undefined) {
          return null;
        }

        const replacement = createOfflineRecord({
          studentId: current.studentId,
          deliveryItem: {
            publication: current.publication,
            package: current.package,
          },
          cachedAt: current.cachedAt,
          lastVerifiedAt,
          accessState: OFFLINE_ACCESS_STATES.REVOKED,
        });
        await requestResult(store.put(toStorageRecord(replacement)));
        return replacement;
      });
    },
  });
}
