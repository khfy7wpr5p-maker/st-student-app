function disabledConfig() {
  return Object.freeze({
    enabled: false,
    baseUrl: null,
  });
}

export function createSecureDeliveryConfig(
  env = import.meta.env ?? {},
) {
  const raw =
    env?.VITE_SECURE_DELIVERY_API_BASE_URL;

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

  return Object.freeze({
    enabled: true,
    baseUrl:
      url.toString().replace(/\/$/u, ""),
  });
}
