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

  async function request(
    path,
    { method = "GET", body = undefined } = {},
  ) {
    let token;
    try {
      token = requiredText(
        await getIdToken(),
        "Firebase ID token",
      );
    } catch {
      throw new SecureDeliveryApiError({
        status: 401,
        code: "UNAUTHENTICATED",
        message:
          "Secure Delivery authentication unavailable",
      });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    const init = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(
        `${root}/${path}`,
        init,
      );
    } catch {
      throw new SecureDeliveryApiError({
        status: 0,
        code:
          "SECURE_DELIVERY_UNAVAILABLE",
        message:
          "Secure Delivery request failed",
      });
    }

    if (
      response === null ||
      typeof response !== "object" ||
      typeof response.ok !== "boolean" ||
      !Number.isInteger(
        response.status,
      ) ||
      typeof response.json !==
        "function"
    ) {
      throw new SecureDeliveryApiError({
        status: 0,
        code:
          "SECURE_DELIVERY_UNAVAILABLE",
        message:
          "Secure Delivery request failed",
      });
    }

    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    if (
      !response.ok ||
      responseBody?.success !== true
    ) {
      throw new SecureDeliveryApiError({
        status: response.status,
        code:
          typeof responseBody?.error?.code ===
          "string"
            ? responseBody.error.code
            : "SECURE_DELIVERY_UNAVAILABLE",
        message:
          "Secure Delivery request failed",
      });
    }

    return responseBody.data;
  }

  return Object.freeze({
    listStudentPool() {
      return request("student/pool");
    },

    requestStudentWork(title) {
      return request(
        "student/work-requests",
        {
          method: "POST",
          body: {
            title: requiredText(title, "title"),
          },
        },
      );
    },

    listSharedPendingWorkRequests() {
      return request(
        "student/work-requests/pending",
      );
    },

    listStudentAssignments() {
      return request("student/assignments");
    },

    listStudentPieces() {
      return request("student/pieces");
    },

    getStudentPiece(pieceAssignmentId) {
      return request(
        `student/pieces/${encodeURIComponent(
          requiredText(
            pieceAssignmentId,
            "pieceAssignmentId",
          ),
        )}`,
      );
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
