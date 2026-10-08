function requiredText(value, name, maxLength = 2048) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TypeError(`${name} must be a bounded non-empty string`);
  }

  return normalized;
}

const PUBLIC_ERROR_CODES = new Set([
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
]);

export class AccountServiceApiError extends Error {
  constructor({ status, code }) {
    super("Account service request failed");
    this.name = "AccountServiceApiError";
    this.status = status;
    this.code = code;
  }
}

export function createAccountServiceApiClient({
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

  async function request(path, { body, authenticated = false } = {}) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (authenticated) {
      let token;
      try {
        token = requiredText(await getIdToken(), "Firebase ID token", 16384);
      } catch {
        throw new AccountServiceApiError({
          status: 401,
          code: "UNAUTHORIZED",
        });
      }
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetchImpl(`${root}/${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch {
      throw new AccountServiceApiError({
        status: 0,
        code: "SERVICE_UNAVAILABLE",
      });
    }

    if (
      response === null ||
      typeof response !== "object" ||
      typeof response.ok !== "boolean" ||
      !Number.isInteger(response.status) ||
      typeof response.json !== "function"
    ) {
      throw new AccountServiceApiError({
        status: 0,
        code: "SERVICE_UNAVAILABLE",
      });
    }

    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    if (!response.ok || responseBody === null || typeof responseBody !== "object") {
      const candidate = responseBody?.error;
      throw new AccountServiceApiError({
        status: response.status,
        code: PUBLIC_ERROR_CODES.has(candidate)
          ? candidate
          : "SERVICE_UNAVAILABLE",
      });
    }

    return responseBody;
  }

  return Object.freeze({
    resolveInvitation(inviteToken) {
      return request("public/invitations/resolve", {
        body: {
          inviteToken: requiredText(inviteToken, "inviteToken"),
        },
      });
    },

    acceptInvitation(inviteToken) {
      return request("student/invitations/accept", {
        authenticated: true,
        body: {
          inviteToken: requiredText(inviteToken, "inviteToken"),
        },
      });
    },
  });
}
