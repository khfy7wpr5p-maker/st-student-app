import { createBrowserConnectivityPort } from "./connectivityPort.js";
import { createIndexedDbOfflineRepository } from "./indexedDbOfflineRepository.js";
import { createOfflineAwareSharingService } from "./offlineAwareSharingService.js";

export function createDefaultOfflineInfrastructure({
  onlineSharingService,
  indexedDBObject = globalThis.indexedDB,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
  dbName = "st-student-app",
} = {}) {
  if (
    onlineSharingService === null ||
    typeof onlineSharingService !== "object"
  ) {
    throw new TypeError("onlineSharingService is required");
  }

  const connectivityPort = createBrowserConnectivityPort({
    navigatorObject,
    windowObject,
  });

  let offlineRepository = null;

  try {
    offlineRepository = createIndexedDbOfflineRepository({
      indexedDB: indexedDBObject,
      dbName,
    });
  } catch {
    offlineRepository = null;
  }

  if (offlineRepository === null) {
    return Object.freeze({
      sharingService: onlineSharingService,
      connectivityPort,
      offlineRepository: null,
      offlineRepositoryAvailable: false,
    });
  }

  return Object.freeze({
    sharingService: createOfflineAwareSharingService({
      onlineSharingService,
      offlineRepository,
      connectivityPort,
    }),
    connectivityPort,
    offlineRepository,
    offlineRepositoryAvailable: true,
  });
}
