import {
  OFFLINE_ACCESS_STATES,
  createOfflineRecord,
} from "./offlineRecord.js";
import {
  createPracticeAccessRef,
  practiceAccessKey,
} from "../practice/practiceAccessRef.js";

const STORE_NAME = "practicePackages";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function requireText(value, name) {
  if (!hasText(value)) {
    throw new TypeError(
      `${name} must be a non-empty string`,
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

const studentScopeKey = ({
  studentId,
  scope,
}) => `${studentId}\u0000${scope}`;

const studentAccessKey = ({
  studentId,
  accessRef,
}) =>
  `${studentId}\u0000${practiceAccessKey(accessRef)}`;

const studentPublicationKey = ({
  studentId,
  publicationId,
}) =>
  `${studentId}\u0000${publicationId}`;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () =>
      resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error(
            "IndexedDB request failed",
          ),
      );
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () =>
      resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error(
            "IndexedDB transaction aborted",
          ),
      );
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error(
            "IndexedDB transaction failed",
          ),
      );
  });
}

function toStorageRecord(record) {
  const stored = {
    ...structuredClone(record),
    cacheKey: cacheKey(record),
    studentScopeKey:
      studentScopeKey(record),
    studentAccessKey:
      studentAccessKey(record),
  };

  if (
    record.accessRef.kind ===
    "PUBLICATION"
  ) {
    stored.studentPublicationKey =
      studentPublicationKey({
        studentId: record.studentId,
        publicationId:
          record.accessRef.publicationId,
      });
  }

  return stored;
}

function fromStorageRecord(stored) {
  if (
    stored === undefined ||
    stored === null
  ) {
    return null;
  }

  const accessRef =
    stored.accessRef !== undefined
      ? createPracticeAccessRef(
          stored.accessRef,
        )
      : createPracticeAccessRef({
          kind: "PUBLICATION",
          publicationId:
            stored.publicationId,
        });

  const common = {
    studentId: stored.studentId,
    cachedAt: stored.cachedAt,
    lastVerifiedAt:
      stored.lastVerifiedAt,
    accessState:
      stored.accessState,
  };

  if (
    accessRef.kind ===
    "SECURE_DELIVERY"
  ) {
    return createOfflineRecord({
      ...common,
      practiceItem: {
        accessRef,
        package: stored.package,
      },
    });
  }

  return createOfflineRecord({
    ...common,
    deliveryItem: {
      publication:
        stored.publication,
      package: stored.package,
    },
  });
}

function recordInput(record) {
  if (
    record.accessRef.kind ===
    "SECURE_DELIVERY"
  ) {
    return {
      practiceItem: {
        accessRef: record.accessRef,
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

function samePackage(left, right) {
  return (
    JSON.stringify(left) ===
    JSON.stringify(right)
  );
}

function newestRecord(records) {
  return records.reduce(
    (newest, record) => {
      if (newest === null) {
        return record;
      }

      if (
        record.cachedAt >
        newest.cachedAt
      ) {
        return record;
      }

      if (
        record.cachedAt ===
          newest.cachedAt &&
        record.packageId >
          newest.packageId
      ) {
        return record;
      }

      return newest;
    },
    null,
  );
}

function newestActivePerAccess(records) {
  const newestByAccess =
    new Map();

  for (const record of records) {
    if (
      record === null ||
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

  return [
    ...newestByAccess.values(),
  ];
}

export function createIndexedDbOfflineRepository({
  indexedDB,
  dbName = "st-student-app",
  dbVersion = 2,
}) {
  if (
    indexedDB === null ||
    typeof indexedDB?.open !==
      "function"
  ) {
    throw new Error(
      "IndexedDB is unavailable",
    );
  }

  let dbPromise = null;

  function openDatabase() {
    if (dbPromise !== null) {
      return dbPromise;
    }

    dbPromise = new Promise(
      (resolve, reject) => {
        const request =
          indexedDB.open(
            dbName,
            dbVersion,
          );

        request.onupgradeneeded =
          (event) => {
            const db =
              request.result;
            let store;

            if (
              !db.objectStoreNames.contains(
                STORE_NAME,
              )
            ) {
              store =
                db.createObjectStore(
                  STORE_NAME,
                  {
                    keyPath:
                      "cacheKey",
                  },
                );
            } else {
              store =
                request.transaction
                  .objectStore(
                    STORE_NAME,
                  );
            }

            if (
              !store.indexNames.contains(
                "byStudent",
              )
            ) {
              store.createIndex(
                "byStudent",
                "studentId",
                { unique: false },
              );
            }

            if (
              !store.indexNames.contains(
                "byStudentScope",
              )
            ) {
              store.createIndex(
                "byStudentScope",
                "studentScopeKey",
                { unique: false },
              );
            }

            if (
              !store.indexNames.contains(
                "byStudentPublication",
              )
            ) {
              store.createIndex(
                "byStudentPublication",
                "studentPublicationKey",
                { unique: false },
              );
            }

            if (
              !store.indexNames.contains(
                "byStudentAccess",
              )
            ) {
              store.createIndex(
                "byStudentAccess",
                "studentAccessKey",
                { unique: false },
              );
            }

            if (
              event.oldVersion < 2
            ) {
              const cursorRequest =
                store.openCursor();

              cursorRequest.onsuccess =
                () => {
                  const cursor =
                    cursorRequest.result;

                  if (
                    cursor === null
                  ) {
                    return;
                  }

                  const value =
                    cursor.value;

                  if (
                    !hasText(
                      value.accessKey,
                    ) &&
                    hasText(
                      value.publicationId,
                    )
                  ) {
                    value.accessRef = {
                      kind:
                        "PUBLICATION",
                      publicationId:
                        value.publicationId,
                    };
                    value.accessKey =
                      practiceAccessKey(
                        value.accessRef,
                      );
                    value.studentAccessKey =
                      studentAccessKey({
                        studentId:
                          value.studentId,
                        accessRef:
                          value.accessRef,
                      });
                    cursor.update(
                      value,
                    );
                  }

                  cursor.continue();
                };
            }
          };

        request.onsuccess = () =>
          resolve(request.result);

        request.onerror = () => {
          dbPromise = null;
          reject(
            request.error ??
              new Error(
                "IndexedDB open failed",
              ),
          );
        };

        request.onblocked = () => {
          dbPromise = null;
          reject(
            new Error(
              "IndexedDB open blocked",
            ),
          );
        };
      },
    );

    return dbPromise;
  }

  async function withStore(
    mode,
    operation,
  ) {
    const db =
      await openDatabase();
    const transaction =
      db.transaction(
        STORE_NAME,
        mode,
      );
    const store =
      transaction.objectStore(
        STORE_NAME,
      );
    const done =
      transactionDone(transaction);

    try {
      const result =
        await operation(store);
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

  async function recordsForAccess(
    store,
    studentId,
    accessRef,
  ) {
    return requestResult(
      store
        .index("byStudentAccess")
        .getAll(
          studentAccessKey({
            studentId,
            accessRef,
          }),
        ),
    );
  }

  async function getActiveByAccessRef({
    studentId,
    accessRef,
  }) {
    requireText(
      studentId,
      "studentId",
    );
    const ref =
      createPracticeAccessRef(
        accessRef,
      );

    return withStore(
      "readonly",
      async (store) => {
        const stored =
          await recordsForAccess(
            store,
            studentId,
            ref,
          );

        return newestRecord(
          stored
            .map(
              fromStorageRecord,
            )
            .filter(
              (record) =>
                record !== null &&
                record.accessState ===
                  OFFLINE_ACCESS_STATES.ACTIVE,
            ),
        );
      },
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

      return withStore(
        "readwrite",
        async (store) => {
          const existingRecords =
            (
              await recordsForAccess(
                store,
                incoming.studentId,
                incoming.accessRef,
              )
            )
              .map(
                fromStorageRecord,
              )
              .filter(
                (record) =>
                  record !== null,
              );

          const scopeConflict =
            existingRecords.find(
              (record) =>
                record.scope !==
                incoming.scope,
            );

          if (
            scopeConflict
          ) {
            throw new Error(
              "student access scope changed unexpectedly",
            );
          }

          const exact =
            existingRecords.find(
              (record) =>
                record.packageId ===
                incoming.packageId,
            );

          let next = incoming;

          if (exact) {
            if (
              !samePackage(
                exact.package,
                incoming.package,
              )
            ) {
              throw new Error(
                "immutable package snapshot conflict",
              );
            }

            next =
              createOfflineRecord({
                studentId:
                  exact.studentId,
                ...recordInput(
                  exact,
                ),
                cachedAt:
                  incoming.cachedAt,
                lastVerifiedAt:
                  incoming.lastVerifiedAt,
                accessState:
                  exact.accessState,
              });
          }

          await requestResult(
            store.put(
              toStorageRecord(
                next,
              ),
            ),
          );

          return next;
        },
      );
    },

    async listActiveForStudent({
      studentId,
      scope = null,
    }) {
      requireText(
        studentId,
        "studentId",
      );

      return withStore(
        "readonly",
        async (store) => {
          const stored =
            scope === null
              ? await requestResult(
                  store
                    .index(
                      "byStudent",
                    )
                    .getAll(
                      studentId,
                    ),
                )
              : await requestResult(
                  store
                    .index(
                      "byStudentScope",
                    )
                    .getAll(
                      studentScopeKey({
                        studentId,
                        scope,
                      }),
                    ),
                );

          return newestActivePerAccess(
            stored.map(
              fromStorageRecord,
            ),
          );
        },
      );
    },

    async listAllForStudent({
      studentId,
    }) {
      requireText(
        studentId,
        "studentId",
      );

      return withStore(
        "readonly",
        async (store) => {
          const stored =
            await requestResult(
              store
                .index(
                  "byStudent",
                )
                .getAll(
                  studentId,
                ),
            );

          return stored.map(
            fromStorageRecord,
          );
        },
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
      requireText(
        studentId,
        "studentId",
      );
      const ref =
        resolveAccessRef({
          accessRef,
          publicationId,
        });

      if (
        packageId !== null
      ) {
        requireText(
          packageId,
          "packageId",
        );
      }

      return withStore(
        "readwrite",
        async (store) => {
          const stored =
            await recordsForAccess(
              store,
              studentId,
              ref,
            );

          const matching =
            stored
              .map(
                fromStorageRecord,
              )
              .filter(
                (record) =>
                  record !== null,
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

          if (
            current === null
          ) {
            return null;
          }

          if (
            current.accessState ===
            OFFLINE_ACCESS_STATES.REVOKED
          ) {
            return current;
          }

          const replacement =
            createOfflineRecord({
              studentId:
                current.studentId,
              ...recordInput(
                current,
              ),
              cachedAt:
                current.cachedAt,
              lastVerifiedAt,
              accessState:
                OFFLINE_ACCESS_STATES.ACTIVE,
            });

          await requestResult(
            store.put(
              toStorageRecord(
                replacement,
              ),
            ),
          );

          return replacement;
        },
      );
    },

    async markRevoked({
      studentId,
      accessRef,
      publicationId,
      lastVerifiedAt,
    }) {
      requireText(
        studentId,
        "studentId",
      );
      const ref =
        resolveAccessRef({
          accessRef,
          publicationId,
        });

      return withStore(
        "readwrite",
        async (store) => {
          const stored =
            await recordsForAccess(
              store,
              studentId,
              ref,
            );

          const matching =
            stored
              .map(
                fromStorageRecord,
              )
              .filter(
                (record) =>
                  record !== null,
              );

          if (
            matching.length === 0
          ) {
            return null;
          }

          const replacements =
            matching.map(
              (current) =>
                createOfflineRecord({
                  studentId:
                    current.studentId,
                  ...recordInput(
                    current,
                  ),
                  cachedAt:
                    current.cachedAt,
                  lastVerifiedAt,
                  accessState:
                    OFFLINE_ACCESS_STATES.REVOKED,
                }),
            );

          for (
            const replacement
            of replacements
          ) {
            await requestResult(
              store.put(
                toStorageRecord(
                  replacement,
                ),
              ),
            );
          }

          return newestRecord(
            replacements,
          );
        },
      );
    },
  });
}
