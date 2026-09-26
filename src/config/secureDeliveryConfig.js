const API_BASE_URL_KEY =
  "VITE_SECURE_DELIVERY_API_BASE_URL";

const CANONICAL_SECURE_DELIVERY_PATH =
  "/api/secure-delivery/v1";

function disabledConfig() {
  return Object.freeze({
    enabled: false,
    baseUrl: null,
  });
}

function defaultEnvironment() {
  const viteEnv = import.meta.env;

  if (
    viteEnv !== undefined &&
    viteEnv !== null &&
    Object.prototype.hasOwnProperty.call(
      viteEnv,
      API_BASE_URL_KEY,
    )
  ) {
    return viteEnv;
  }

  return {
    [API_BASE_URL_KEY]:
      globalThis
        .__ST_STUDENT_APP_CONFIG__
        ?.secureDeliveryApiBaseUrl,
  };
}

export function createSecureDeliveryConfig(
  env = defaultEnvironment(),
) {
  const raw =
    env?.[API_BASE_URL_KEY];

  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ""
  ) {
    return disabledConfig();
  }

  let url;
  try {
    url = new URL(
      String(raw).trim(),
    );
  } catch {
    return disabledConfig();
  }

  if (url.protocol !== "https:") {
    return disabledConfig();
  }

  if (
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  ) {
    url.pathname =
      CANONICAL_SECURE_DELIVERY_PATH;
  }

  return Object.freeze({
    enabled: true,
    baseUrl:
      url.toString().replace(/\/$/u, ""),
  });
}
