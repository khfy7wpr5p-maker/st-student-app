import {
  createSecureDeliveryOfflineReadService,
} from "../offline/secureDeliveryOfflineReadService.js";
import {
  createSecureDeliveryStatusService,
} from "../offline/secureDeliveryStatusService.js";
import {
  createSecureDeliveryApiClient,
} from "../providers/secureDelivery/secureDeliveryApiClient.js";
import {
  createSecureDeliveryStudent08ReadService,
} from "../sharing/secureDeliveryStudent08ReadService.js";

export function createStudent08Composition({
  config,
  authAdapter,
  fetchImpl = globalThis.fetch,
  connectivityPort,
  offlineRepository,
} = {}) {
  if (config?.enabled !== true) {
    return Object.freeze({
      student08ReadService: null,
      secureDeliveryStatusService:
        null,
    });
  }

  if (
    typeof config?.baseUrl !== "string" ||
    config.baseUrl.trim().length === 0
  ) {
    throw new TypeError(
      "Secure Delivery baseUrl is required",
    );
  }

  if (
    typeof authAdapter?.getIdToken !==
    "function"
  ) {
    throw new TypeError(
      "authAdapter must provide getIdToken()",
    );
  }

  const apiClient =
    createSecureDeliveryApiClient({
      baseUrl: config.baseUrl,
      getIdToken: () =>
        authAdapter.getIdToken(),
      fetchImpl,
    });

  const onlineReadService =
    createSecureDeliveryStudent08ReadService({
      apiClient,
    });

  const student08ReadService =
    offlineRepository === null ||
    offlineRepository === undefined
      ? onlineReadService
      : createSecureDeliveryOfflineReadService({
          onlineReadService,
          offlineRepository,
          connectivityPort,
        });

  return Object.freeze({
    student08ReadService,
    secureDeliveryStatusService:
      createSecureDeliveryStatusService({
        apiClient,
      }),
  });
}
