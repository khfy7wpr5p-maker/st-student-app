import { getAuthenticatedStudentId } from "../auth/session.js";
import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";
import { createDeliveryItem } from "../sharing/deliveryItem.js";
import { CONNECTIVITY_STATES } from "./connectivityPort.js";

function requireStudentId(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("unauthenticated");
  }

  return studentId;
}

function annotate(item, {
  source,
  deviceAvailable,
  saveFailed = false,
}) {
  return Object.freeze({
    ...item,
    offlineAvailability: Object.freeze({
      source,
      deviceAvailable,
      saveFailed,
    }),
  });
}

function recordToDelivery(record) {
  return createDeliveryItem(record.publication, record.package);
}

export function createOfflineAwareSharingService({
  onlineSharingService,
  offlineRepository,
  connectivityPort,
  clock = () => new Date().toISOString(),
}) {
  if (
    onlineSharingService === null ||
    typeof onlineSharingService !== "object"
  ) {
    throw new TypeError("onlineSharingService is required");
  }

  if (
    offlineRepository === null ||
    typeof offlineRepository !== "object"
  ) {
    throw new TypeError("offlineRepository is required");
  }

  const isOffline = () =>
    connectivityPort?.getState?.() === CONNECTIVITY_STATES.OFFLINE;

  async function cachedAvailability(studentId, publicationId) {
    try {
      return (
        (await offlineRepository.getActiveByPublicationId({
          studentId,
          publicationId,
        })) !== null
      );
    } catch {
      return false;
    }
  }

  async function annotateOnlineList(studentId, items) {
    return Promise.all(
      items.map(async (item) =>
        annotate(item, {
          source: "online",
          deviceAvailable: await cachedAvailability(
            studentId,
            item.publication.publicationId,
          ),
        }),
      ),
    );
  }

  async function listOffline(studentId, scope) {
    const records = await offlineRepository.listActiveForStudent({
      studentId,
      scope,
    });

    return records.map((record) =>
      annotate(recordToDelivery(record), {
        source: "offline",
        deviceAvailable: true,
      }),
    );
  }

  return Object.freeze({
    async listPublicPool({ session }) {
      const studentId = requireStudentId(session);

      if (isOffline()) {
        return listOffline(
          studentId,
          PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        );
      }

      const items = await Promise.resolve(
        onlineSharingService.listPublicPool({ session }),
      );
      return annotateOnlineList(studentId, items);
    },

    async listMyWork({ session }) {
      const studentId = requireStudentId(session);

      if (isOffline()) {
        return listOffline(
          studentId,
          PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
        );
      }

      const items = await Promise.resolve(
        onlineSharingService.listMyWork({ session }),
      );
      return annotateOnlineList(studentId, items);
    },

    async getPracticeItem({ session, publicationId }) {
      const studentId = requireStudentId(session);

      if (isOffline()) {
        const record =
          await offlineRepository.getActiveByPublicationId({
            studentId,
            publicationId,
          });

        if (record === null) {
          throw new Error("offline practice unavailable");
        }

        return annotate(recordToDelivery(record), {
          source: "offline",
          deviceAvailable: true,
        });
      }

      const item = await Promise.resolve(
        onlineSharingService.getPracticeItem({
          session,
          publicationId,
        }),
      );

      const now = clock();

      try {
        await offlineRepository.putAuthorized({
          studentId,
          deliveryItem: item,
          cachedAt: now,
          lastVerifiedAt: now,
        });

        return annotate(item, {
          source: "online",
          deviceAvailable: true,
        });
      } catch {
        return annotate(item, {
          source: "online",
          deviceAvailable: false,
          saveFailed: true,
        });
      }
    },
  });
}
