const DATABASE_URL_KEY = "VITE_FIREBASE_DATABASE_URL";

export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyAObqpCI5hQlv8hruTWKy8o-6EbAccJOA8",
  authDomain: "st-student-app-85cde.firebaseapp.com",
  projectId: "st-student-app-85cde",
  databaseURL:
    "https://st-student-app-85cde-default-rtdb.europe-west1.firebasedatabase.app",
  appId: "1:70651615398:web:7bdd779be70e72fed03c67",
});

function disabledDatabaseConfig() {
  return Object.freeze({ enabled: false, url: null });
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function defaultDatabaseEnvironment() {
  const viteEnv = import.meta.env;
  if (
    viteEnv !== undefined &&
    viteEnv !== null &&
    Object.prototype.hasOwnProperty.call(viteEnv, DATABASE_URL_KEY) &&
    hasText(viteEnv[DATABASE_URL_KEY])
  ) {
    return viteEnv;
  }

  const runtimeUrl =
    globalThis.__ST_STUDENT_APP_CONFIG__?.firebaseDatabaseUrl;

  return {
    [DATABASE_URL_KEY]: hasText(runtimeUrl)
      ? runtimeUrl
      : firebaseConfig.databaseURL,
  };
}

function isExpectedDatabaseHostname(hostname) {
  const projectId = firebaseConfig.projectId;
  return (
    hostname === `${projectId}-default-rtdb.firebaseio.com` ||
    (hostname.startsWith(`${projectId}-default-rtdb.`) &&
      hostname.endsWith(".firebasedatabase.app"))
  );
}

export function createFirebaseDatabaseConfig(
  env = defaultDatabaseEnvironment(),
) {
  const raw = env?.[DATABASE_URL_KEY];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return disabledDatabaseConfig();
  }

  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return disabledDatabaseConfig();
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/" ||
    !isExpectedDatabaseHostname(url.hostname)
  ) {
    return disabledDatabaseConfig();
  }

  return Object.freeze({ enabled: true, url: url.origin });
}
