function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export class SecureDeliveryApiError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = "SecureDeliveryApiError";
    this.status = status;
    this.code = code;
  }
}

export function createSecureDeliveryApiClient({
  baseUrl,
  getIdToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const root = requiredText(baseUrl, "baseUrl").replace(/\/$/u, "");

  if (typeof getIdToken !== "function") {
    throw new TypeError("getIdToken must be a function");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  async function request(path) {
    const token = requiredText(
      await getIdToken(),
      "Firebase ID token",
    );
    const response = await fetchImpl(
      `${root}/${path}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || body?.success !== true) {
      throw new SecureDeliveryApiError({
        status: response.status,
        code:
          typeof body?.error?.code === "string"
            ? body.error.code
            : "SECURE_DELIVERY_UNAVAILABLE",
        message: "Secure Delivery request failed",
      });
    }

    return body.data;
  }

  return Object.freeze({
    listStudentPool() {
      return request("student/pool");
    },

    listStudentAssignments() {
      return request("student/assignments");
    },

    getStudentAssignment(deliveryId) {
      return request(
        `student/assignments/${encodeURIComponent(
          requiredText(deliveryId, "deliveryId"),
        )}`,
      );
    },
  });
}
