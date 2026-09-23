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
    return Object.freeze({
      enabled: false,
      baseUrl: null,
    });
  }

  const url = new URL(String(raw).trim());
  if (url.protocol !== "https:") {
    throw new TypeError(
      "Secure Delivery API base URL must use https",
    );
  }

  return Object.freeze({
    enabled: true,
    baseUrl: url.toString().replace(/\/$/u, ""),
  });
}
