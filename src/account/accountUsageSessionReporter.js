const SAFE_ID = /^[A-Za-z0-9._:-]+$/u;

function requiredKey(value, name, maxLength) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    !SAFE_ID.test(normalized)
  ) {
    throw new TypeError(`${name} must be a bounded path-safe identifier`);
  }
  return normalized;
}

function secureRandomHex() {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("secure random generator is unavailable");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function defaultClientSessionIdFactory() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string" && uuid.length > 0) {
    return `boot-${uuid}`;
  }
  return `boot-${secureRandomHex()}`;
}

export function createAccountUsageSessionReporter({
  apiClient,
  clientSessionIdFactory = defaultClientSessionIdFactory,
} = {}) {
  if (typeof apiClient?.recordUsageSession !== "function") {
    throw new TypeError("account service usage API is unavailable");
  }
  if (typeof clientSessionIdFactory !== "function") {
    throw new TypeError("clientSessionIdFactory must be a function");
  }

  let clientSessionId = null;
  const completedAuthKeys = new Set();
  const inFlightByAuthKey = new Map();

  function getClientSessionId() {
    if (clientSessionId === null) {
      clientSessionId = requiredKey(
        clientSessionIdFactory(),
        "clientSessionId",
        160,
      );
    }
    return clientSessionId;
  }

  async function reportAuthenticatedBoot(authKey) {
    const key = requiredKey(authKey, "authKey", 160);
    if (completedAuthKeys.has(key)) {
      return null;
    }
    if (inFlightByAuthKey.has(key)) {
      return inFlightByAuthKey.get(key);
    }

    const pending = Promise.resolve()
      .then(() => apiClient.recordUsageSession(getClientSessionId()))
      .then((result) => {
        completedAuthKeys.add(key);
        return result;
      })
      .finally(() => {
        inFlightByAuthKey.delete(key);
      });

    inFlightByAuthKey.set(key, pending);
    return pending;
  }

  return Object.freeze({ reportAuthenticatedBoot });
}
