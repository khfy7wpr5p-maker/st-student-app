import {
  getAuthenticatedStudentId,
} from "../auth/session.js";
import {
  PRACTICE_TYPES,
} from "../contracts/privateAssignment.js";
import {
  CONNECTIVITY_STATES,
} from "./connectivityPort.js";

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

function requiredAssignmentId(value) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      "assignmentId must be a non-empty string",
    );
  }

  return value.trim();
}


function requiredPieceAssignmentId(value) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      "pieceAssignmentId must be a non-empty string",
    );
  }

  return value.trim();
}

function annotate(
  item,
  source,
  deviceAvailable,
  saveFailed = false,
) {
  return Object.freeze({
    ...item,
    offlineAvailability: Object.freeze({
      source,
      deviceAvailable,
      saveFailed,
    }),
  });
}

export function createSecureDeliveryOfflineReadService({
  onlineReadService,
  offlineRepository,
  connectivityPort,
  clock = () => new Date().toISOString(),
  secureDeliveryStatusService = null,
  isSessionCurrent = () => true,
  getSessionEpoch = () => 0,
} = {}) {
  if (
    onlineReadService === null ||
    typeof onlineReadService !== "object" ||
    typeof onlineReadService.listPoolItems !== "function" ||
    typeof onlineReadService.getPoolItem !== "function" ||
    typeof onlineReadService.listAssignments !== "function" ||
    typeof onlineReadService.getAssignment !== "function" ||
    typeof onlineReadService.getScorePracticeItem !== "function" ||
    typeof onlineReadService.getChordBoardPracticeItem !== "function"
  ) {
    throw new TypeError(
      "onlineReadService is incomplete",
    );
  }

  if (
    offlineRepository === null ||
    typeof offlineRepository?.putAuthorized !== "function" ||
    typeof offlineRepository?.getActiveByAccessRef !== "function"
  ) {
    throw new TypeError(
      "offlineRepository is incomplete",
    );
  }

  if (
    connectivityPort === null ||
    typeof connectivityPort?.getState !== "function"
  ) {
    throw new TypeError(
      "connectivityPort is required",
    );
  }

  // Guard the authenticated read boundary, including token/account changes while awaiting it.
  function sessionBound(service) {
    if (service === null) return null;
    const wrapped = {};
    for (const name of Object.keys(service)) {
      Object.defineProperty(wrapped, name, { enumerable: true, get() {
        const method = service[name];
        if (typeof method !== "function") return method;
        return async (args) => {
          const epoch = getSessionEpoch();
          if (!isSessionCurrent(args.session)) throw new Error("stale offline session");
          const result = await method.call(service, args);
          if (!isSessionCurrent(args.session) || epoch !== getSessionEpoch()) {
            throw new Error("stale offline session");
          }
          return result;
        };
      } });
    }
    return wrapped;
  }
  onlineReadService = sessionBound(onlineReadService);
  secureDeliveryStatusService = sessionBound(secureDeliveryStatusService);

  const assignmentViews = new Map();
  const revokedAssignments = new Set();
  const revokedPieces = new Set();

  const isOffline = () =>
    connectivityPort.getState() ===
    CONNECTIVITY_STATES.OFFLINE;

  const assignmentKey = (
    studentId,
    assignmentId,
  ) =>
    `${studentId}\u0000${assignmentId}`;

  async function accessRevoked(studentId, assignmentId) {
    if (revokedAssignments.has(assignmentKey(studentId, assignmentId))) return true;
    if (typeof offlineRepository.isAccessRevoked !== "function") return false;
    try {
      return await offlineRepository.isAccessRevoked({ studentId,
        accessRef: { kind: "SECURE_DELIVERY", deliveryId: assignmentId } });
    } catch (error) {
      if (isOffline()) throw error;
      return false; // Local persistence failure cannot veto authorized online reads.
    }
  }

  async function assertAccess(studentId, assignmentId) {
    if (await accessRevoked(studentId, assignmentId)) throw new Error(isOffline() ? "offline practice unavailable" : "assignment access revoked");
  }

  async function pieceRevoked(studentId, pieceAssignmentId) {
    if (revokedPieces.has(assignmentKey(studentId, pieceAssignmentId))) return true;
    if (typeof offlineRepository.isPieceRevoked !== "function") return false;
    try { return await offlineRepository.isPieceRevoked({ studentId, pieceAssignmentId }); }
    catch (error) { if (isOffline()) throw error; return false; }
  }

  async function authorizedAssignments(studentId, items) {
    const result = [];
    for (const item of items) {
      if (await accessRevoked(studentId, item.assignmentId)) {
        assignmentViews.delete(assignmentKey(studentId, item.assignmentId));
      } else result.push(item);
    }
    return Object.freeze(result);
  }

  async function reconcileMissingAssignments(session, previous, current) {
    if (typeof secureDeliveryStatusService?.getAccessStatus !== "function") return;
    const studentId = requireStudentId(session);
    const present = new Set(current.map((item) => item.assignmentId));
    for (const item of previous) {
      if (present.has(item.assignmentId)) continue;
      try {
        const accessRef = { kind: "SECURE_DELIVERY", deliveryId: item.assignmentId };
        const status = await secureDeliveryStatusService.getAccessStatus({ session, accessRef });
        if (status?.state === "REVOKED") {
          revokedAssignments.add(assignmentKey(studentId, item.assignmentId));
          assignmentViews.delete(assignmentKey(studentId, item.assignmentId));
          await offlineRepository.markRevoked({ studentId, accessRef, lastVerifiedAt: clock() });
        } else if (status?.state === "ACTIVE" && !await accessRevoked(studentId, item.assignmentId)) {
          const updated = await onlineReadService.getAssignment({ session, assignmentId: item.assignmentId });
          if (updated?.assignmentId === item.assignmentId && !await accessRevoked(studentId, item.assignmentId)) {
            cacheAssignment(studentId, updated);
          }
        }
      } catch {
        // List absence and transient failures are never revocation evidence.
      }
    }
  }

  async function reconcileMissingPieces(session, previous, current) {
    if (typeof secureDeliveryStatusService?.getPieceStatus !== "function") return;
    const studentId = requireStudentId(session);
    const present = new Set(current.map((item) => item.pieceAssignmentId));
    for (const record of previous) {
      const pieceAssignmentId = record.pieceAssignmentId;
      if (present.has(pieceAssignmentId)) continue;
      try {
        const status = await secureDeliveryStatusService.getPieceStatus({ session, pieceAssignmentId });
        if (status?.state === "REVOKED") {
          revokedPieces.add(assignmentKey(studentId, pieceAssignmentId));
          for (const id of [record.piece.contentRefs.scoreAssignmentId,
            ...record.piece.contentRefs.chordAssignmentIds].filter(Boolean)) {
            revokedAssignments.add(assignmentKey(studentId, id));
          }
          const revoke = offlineRepository.revokePieceAccess ?? offlineRepository.markPieceManifestRevoked;
          await revoke({ studentId, pieceAssignmentId, lastVerifiedAt: clock() });
        } else if (status?.state === "ACTIVE" && status.piece?.pieceAssignmentId === pieceAssignmentId) {
          await cachePieceManifest(studentId, status.piece);
        }
      } catch {
        // Retain usable snapshots when the exact status cannot be learned.
      }
    }
  }

  function cacheAssignment(
    studentId,
    item,
  ) {
    assignmentViews.set(
      assignmentKey(
        studentId,
        item.assignmentId,
      ),
      item,
    );
    return item;
  }

  function cachedAssignmentsForStudent(
    studentId,
  ) {
    const prefix =
      `${studentId}\u0000`;

    return [
      ...assignmentViews.entries(),
    ]
      .filter(([key]) =>
        key.startsWith(prefix),
      )
      .map(([, item]) => item);
  }

  async function requestWork({
    session,
    title,
  } = {}) {
    requireStudentId(session);

    if (isOffline()) {
      throw new Error(
        "Secure Delivery work request unavailable offline",
      );
    }

    if (
      typeof onlineReadService.requestWork !==
      "function"
    ) {
      throw new TypeError(
        "online work request service is unavailable",
      );
    }

    return onlineReadService.requestWork({
      session,
      title,
    });
  }

  async function listSharedWorkRequests({
    session,
  } = {}) {
    requireStudentId(session);

    if (isOffline()) {
      throw new Error(
        "Secure Delivery shared Havuz unavailable offline",
      );
    }

    if (
      typeof onlineReadService
        .listSharedWorkRequests !== "function"
    ) {
      throw new TypeError(
        "online shared Havuz service is unavailable",
      );
    }

    return onlineReadService
      .listSharedWorkRequests({ session });
  }

  async function listAssignments({
    session,
    state,
  } = {}) {
    const studentId =
      requireStudentId(session);

    if (isOffline()) {
      return Object.freeze(
        await authorizedAssignments(studentId, cachedAssignmentsForStudent(
          studentId,
        ).filter(
          (item) =>
            state === undefined ||
            item.state === state,
        )),
      );
    }

    const previous = cachedAssignmentsForStudent(studentId).filter((item) => state === undefined || item.state === state);
    const items =
      await onlineReadService.listAssignments({
        session,
        state,
      });

    if (!Array.isArray(items)) {
      throw new TypeError(
        "student assignment response must be an array",
      );
    }

    await reconcileMissingAssignments(session, previous, items);
    const authorized = await authorizedAssignments(studentId, items);
    for (const item of authorized) {
      cacheAssignment(
        studentId,
        item,
      );
    }

    return authorized;
  }

  async function getAssignment({
    session,
    assignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredAssignmentId(
        assignmentId,
      );

    await assertAccess(studentId, id);
    if (isOffline()) {
      const cached =
        assignmentViews.get(
          assignmentKey(
            studentId,
            id,
          ),
        ) ?? null;

      if (cached === null) {
        throw new Error(
          "offline assignment metadata unavailable",
        );
      }

      return cached;
    }

    const item =
      await onlineReadService.getAssignment({
        session,
        assignmentId: id,
      });

    if (
      item?.assignmentId !== id
    ) {
      throw new Error(
        "assignment identity mismatch",
      );
    }

    await assertAccess(studentId, id);
    return cacheAssignment(
      studentId,
      item,
    );
  }

  async function getPrivatePracticeItem({
    session,
    assignmentId,
    expectedPracticeType,
    onlineMethod,
  }) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredAssignmentId(
        assignmentId,
      );
    const accessRef =
      Object.freeze({
        kind: "SECURE_DELIVERY",
        deliveryId: id,
      });

    await assertAccess(studentId, id);
    if (isOffline()) {
      const record =
        await offlineRepository
          .getActiveByAccessRef({
            studentId,
            accessRef,
          });

      if (
        record === null ||
        record.practiceType !==
          expectedPracticeType
      ) {
        throw new Error(
          "offline practice unavailable",
        );
      }

      return annotate(
        Object.freeze({
          accessRef:
            record.accessRef,
          practiceType:
            record.practiceType,
          package:
            record.package,
        }),
        "offline",
        true,
      );
    }

    const item =
      await onlineMethod({
        session,
        assignmentId: id,
      });

    if (
      item?.accessRef?.kind !==
        "SECURE_DELIVERY" ||
      item.accessRef.deliveryId !== id ||
      item.practiceType !==
        expectedPracticeType
    ) {
      throw new Error(
        "assignment identity mismatch",
      );
    }

    await assertAccess(studentId, id);
    const now = clock();
    let saved;

    try {
      saved = await offlineRepository
        .putAuthorized({
          studentId,
          practiceItem: item,
          cachedAt: now,
          lastVerifiedAt: now,
        });

      if (saved?.accessState === "REVOKED") throw new Error("assignment access revoked");
      await assertAccess(studentId, id);
      return annotate(item, "online", true);
    } catch (error) {
      if (saved?.accessState === "REVOKED") throw error;
      await assertAccess(studentId, id);
      return annotate(
        item,
        "online",
        false,
        true,
      );
    }
  }

  function getScorePracticeItem({
    session,
    assignmentId,
  } = {}) {
    return getPrivatePracticeItem({
      session,
      assignmentId,
      expectedPracticeType:
        PRACTICE_TYPES.SCORE,
      onlineMethod:
        onlineReadService
          .getScorePracticeItem,
    });
  }

  function getChordBoardPracticeItem({
    session,
    assignmentId,
  } = {}) {
    return getPrivatePracticeItem({
      session,
      assignmentId,
      expectedPracticeType:
        PRACTICE_TYPES.CHORD_BOARD,
      onlineMethod:
        onlineReadService
          .getChordBoardPracticeItem,
    });
  }


  function requirePieceRepository() {
    for (const method of [
      "putPieceManifest",
      "getActivePieceManifest",
      "listActivePieceManifests",
      "markPieceManifestRevoked",
    ]) {
      if (
        typeof offlineRepository?.[method] !==
        "function"
      ) {
        throw new TypeError(
          "offline Piece repository is incomplete",
        );
      }
    }
  }

  function requireOnlinePieceService() {
    for (const method of [
      "listPieces",
      "getPiece",
      "getPieceScoreItem",
      "listPieceChordItems",
    ]) {
      if (
        typeof onlineReadService?.[method] !==
        "function"
      ) {
        throw new TypeError(
          "online Piece read service is incomplete",
        );
      }
    }
  }

  async function cachePieceManifest(
    studentId,
    piece,
  ) {
    requirePieceRepository();
    const now = clock();
    return offlineRepository.putPieceManifest({
      studentId,
      piece,
      cachedAt: now,
      lastVerifiedAt: now,
    });
  }

  async function listPieces({
    session,
    state,
  } = {}) {
    const studentId =
      requireStudentId(session);
    requirePieceRepository();

    if (isOffline()) {
      const records =
        await offlineRepository
          .listActivePieceManifests({
            studentId,
            state,
          });
      return Object.freeze(
        records.filter((record) => !revokedPieces.has(assignmentKey(studentId, record.pieceAssignmentId)))
          .map((record) => record.piece),
      );
    }

    requireOnlinePieceService();
    let previous = [];
    try { previous = await offlineRepository.listActivePieceManifests({ studentId, state }); } catch {}
    const pieces =
      await onlineReadService.listPieces({
        session,
        state,
      });

    if (!Array.isArray(pieces)) {
      throw new TypeError(
        "student Piece response must be an array",
      );
    }

    await reconcileMissingPieces(session, previous, pieces);
    const authorized = [];
    for (const piece of pieces) {
      if (await pieceRevoked(studentId, piece.pieceAssignmentId)) continue;
      try {
        const record = await cachePieceManifest(
          studentId,
          piece,
        );
        if (record?.accessState === "REVOKED") continue;
      } catch {
        // Online authority remains usable if local persistence fails.
      }
      if (!await pieceRevoked(studentId, piece.pieceAssignmentId)) authorized.push(piece);
    }

    return Object.freeze(authorized);
  }

  async function getPiece({
    session,
    pieceAssignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredPieceAssignmentId(
        pieceAssignmentId,
      );
    requirePieceRepository();

    if (await pieceRevoked(studentId, id)) throw new Error(isOffline() ? "offline Piece manifest unavailable" : "Piece access revoked");
    if (isOffline()) {
      const record =
        await offlineRepository
          .getActivePieceManifest({
            studentId,
            pieceAssignmentId: id,
          });

      if (record === null) {
        throw new Error(
          "offline Piece manifest unavailable",
        );
      }

      return record.piece;
    }

    requireOnlinePieceService();
    const piece =
      await onlineReadService.getPiece({
        session,
        pieceAssignmentId: id,
      });

    if (
      piece?.pieceAssignmentId !== id
    ) {
      throw new Error(
        "Piece identity mismatch",
      );
    }

    try {
      await cachePieceManifest(
        studentId,
        piece,
      );
    } catch {
      // Online authority remains usable if local persistence fails.
    }

    if (await pieceRevoked(studentId, id)) throw new Error(isOffline() ? "offline Piece manifest unavailable" : "Piece access revoked");
    return piece;
  }

  async function cachedOrOnlinePiece({
    session,
    studentId,
    pieceAssignmentId,
  }) {
    requirePieceRepository();
    let cached = null;
    try {
      cached = await offlineRepository.getActivePieceManifest({ studentId, pieceAssignmentId });
    } catch (error) {
      if (isOffline()) throw error;
      // A blocked upgrade or failed local read must not prevent an authorized online open.
    }

    if (cached !== null) {
      return cached.piece;
    }

    if (isOffline()) {
      throw new Error(
        "offline Piece manifest unavailable",
      );
    }

    return getPiece({
      session,
      pieceAssignmentId,
    });
  }

  async function cachePiecePracticeItem({
    studentId,
    item,
    expectedPracticeType,
    expectedAssignmentId,
  }) {
    if (
      item?.accessRef?.kind !==
        "SECURE_DELIVERY" ||
      item.accessRef.deliveryId !==
        expectedAssignmentId ||
      item.practiceType !==
        expectedPracticeType
    ) {
      throw new Error(
        "Piece child assignment identity mismatch",
      );
    }

    await assertAccess(studentId, expectedAssignmentId);
    const now = clock();
    let saved;
    try {
      saved = await offlineRepository
        .putAuthorized({
          studentId,
          practiceItem: item,
          cachedAt: now,
          lastVerifiedAt: now,
        });

      if (saved?.accessState === "REVOKED") throw new Error("assignment access revoked");
      await assertAccess(studentId, expectedAssignmentId);
      return annotate(
        item,
        "online",
        true,
      );
    } catch (error) {
      if (saved?.accessState === "REVOKED") throw error;
      await assertAccess(studentId, expectedAssignmentId);
      return annotate(
        item,
        "online",
        false,
        true,
      );
    }
  }

  async function getPieceScoreItem({
    session,
    pieceAssignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredPieceAssignmentId(
        pieceAssignmentId,
      );
    const piece =
      await cachedOrOnlinePiece({
        session,
        studentId,
        pieceAssignmentId: id,
      });
    const assignmentId =
      piece.contentRefs
        .scoreAssignmentId;

    if (assignmentId === null) {
      throw new Error(
        "piece score unavailable",
      );
    }

    if (isOffline()) {
      return getScorePracticeItem({
        session,
        assignmentId,
      });
    }

    requireOnlinePieceService();
    const item =
      await onlineReadService
        .getPieceScoreItem({
          session,
          pieceAssignmentId: id,
        });

    return cachePiecePracticeItem({
      studentId,
      item,
      expectedPracticeType:
        PRACTICE_TYPES.SCORE,
      expectedAssignmentId:
        assignmentId,
    });
  }

  async function listPieceChordItems({
    session,
    pieceAssignmentId,
  } = {}) {
    const studentId =
      requireStudentId(session);
    const id =
      requiredPieceAssignmentId(
        pieceAssignmentId,
      );
    const piece =
      await cachedOrOnlinePiece({
        session,
        studentId,
        pieceAssignmentId: id,
      });
    const assignmentIds =
      piece.contentRefs
        .chordAssignmentIds;

    if (isOffline()) {
      const items = [];
      for (const assignmentId of assignmentIds) {
        items.push(
          await getChordBoardPracticeItem({
            session,
            assignmentId,
          }),
        );
      }
      return Object.freeze(items);
    }

    requireOnlinePieceService();
    const raw =
      await onlineReadService
        .listPieceChordItems({
          session,
          pieceAssignmentId: id,
        });

    if (
      !Array.isArray(raw) ||
      raw.length !==
        assignmentIds.length
    ) {
      throw new Error(
        "Piece chord authority mismatch",
      );
    }

    const items = [];
    for (
      let index = 0;
      index < raw.length;
      index += 1
    ) {
      items.push(
        await cachePiecePracticeItem({
          studentId,
          item: raw[index],
          expectedPracticeType:
            PRACTICE_TYPES.CHORD_BOARD,
          expectedAssignmentId:
            assignmentIds[index],
        }),
      );
    }

    return Object.freeze(items);
  }

  return Object.freeze({
    listCachedAccessRefs({ session }) {
      const studentId = requireStudentId(session);
      return cachedAssignmentsForStudent(studentId).map((item) => ({ kind: "SECURE_DELIVERY", deliveryId: item.assignmentId }));
    },
    async listPoolItems({
      session,
    } = {}) {
      requireStudentId(session);

      if (isOffline()) {
        throw new Error(
          "Secure Delivery Pool unavailable offline",
        );
      }

      return onlineReadService
        .listPoolItems({
          session,
        });
    },

    async getPoolItem({
      session,
      poolItemId,
    } = {}) {
      requireStudentId(session);

      if (isOffline()) {
        throw new Error(
          "Secure Delivery Pool unavailable offline",
        );
      }

      return onlineReadService
        .getPoolItem({
          session,
          poolItemId,
        });
    },

    requestWork,
    listSharedWorkRequests,
    listAssignments,
    getAssignment,
    getScorePracticeItem,
    getChordBoardPracticeItem,
    listPieces,
    getPiece,
    getPieceScoreItem,
    listPieceChordItems,
  });
}
