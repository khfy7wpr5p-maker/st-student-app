const API_BASE_URL_KEY = "VITE_ACCOUNT_SERVICE_API_BASE_URL";
const CANONICAL_ACCOUNT_SERVICE_PATH = "/api/student-accounts/v1";

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
    Object.prototype.hasOwnProperty.call(viteEnv, API_BASE_URL_KEY)
  ) {
    return viteEnv;
  }

  return {
    [API_BASE_URL_KEY]:
      globalThis.__ST_STUDENT_APP_CONFIG__?.accountServiceApiBaseUrl,
  };
}

function isLoopbackHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function createAccountServiceConfig(env = defaultEnvironment()) {
  const raw = env?.[API_BASE_URL_KEY];

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return disabledConfig();
  }

  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return disabledConfig();
  }

  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && isLoopbackHostname(url.hostname);
  if (!secure && !localHttp) {
    return disabledConfig();
  }

  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return disabledConfig();
  }

  if (url.pathname === "/") {
    url.pathname = CANONICAL_ACCOUNT_SERVICE_PATH;
  }

  return Object.freeze({
    enabled: true,
    baseUrl: url.toString().replace(/\/$/u, ""),
  });
}
