export const NOTATION_RUNTIME_STATES = Object.freeze({
  READY: "READY",
  UNAVAILABLE: "UNAVAILABLE",
  ERROR: "ERROR",
});

const DEFAULT_CONTRACT_VERSION = "0.2.0";
const READY_EVENT = "st-score-render-host-ready";

function isRuntime(value) {
  return Boolean(
    value &&
      typeof value.renderMusicXml === "function" &&
      typeof value.dispose === "function",
  );
}

function isTrustedLocalUrl(value, documentObject) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (/^(?:https?:)?\/\//i.test(value)) return false;
  if (!value.startsWith("./") && !value.startsWith("/")) return false;
  try {
    const base = documentObject?.baseURI ?? "https://student.invalid/";
    const resolved = new URL(value, base);
    return resolved.origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export function createNotationRuntimeLoader({
  getRuntime = () => globalThis.__ST_SCORE_RENDER_HOST__,
  getVendorRuntime = () => globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay,
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  bootstrapUrl = null,
  vendorUrl = null,
  expectedContractVersion = DEFAULT_CONTRACT_VERSION,
} = {}) {
  let installPromise = null;

  function isReady() {
    return isRuntime(getRuntime?.());
  }

  function vendorReady() {
    try {
      return typeof getVendorRuntime?.() === "function";
    } catch {
      return false;
    }
  }

  function isInstallable() {
    return Boolean(
      documentObject?.createElement &&
        documentObject?.head?.append &&
        windowObject?.addEventListener &&
        isTrustedLocalUrl(bootstrapUrl, documentObject) &&
        isTrustedLocalUrl(vendorUrl, documentObject),
    );
  }

  function appendScript({ src, type = "" }) {
    return new Promise((resolve, reject) => {
      try {
        const script = documentObject.createElement("script");
        if (type) script.type = type;
        script.src = src;
        script.addEventListener?.("load", () => resolve(script), { once: true });
        script.addEventListener?.("error", () => reject(new Error("runtime asset load failed")), { once: true });
        documentObject.head.append(script);
      } catch {
        reject(new Error("runtime asset load failed"));
      }
    });
  }

  async function install() {
    if (isReady()) return { state: NOTATION_RUNTIME_STATES.READY };
    if (!isInstallable()) return { state: NOTATION_RUNTIME_STATES.UNAVAILABLE };

    return new Promise((resolve) => {
      let settled = false;

      const finish = (state) => {
        if (settled) return;
        settled = true;
        windowObject?.removeEventListener?.(READY_EVENT, onReady);
        resolve({ state });
      };

      const onReady = (event) => {
        const version = event?.detail?.contractVersion;
        if (version !== expectedContractVersion || !isReady()) {
          finish(NOTATION_RUNTIME_STATES.ERROR);
          return;
        }
        finish(NOTATION_RUNTIME_STATES.READY);
      };

      windowObject.addEventListener(READY_EVENT, onReady);

      (async () => {
        try {
          if (!vendorReady()) {
            await appendScript({ src: vendorUrl });
            if (!vendorReady()) {
              finish(NOTATION_RUNTIME_STATES.ERROR);
              return;
            }
          }

          const bootstrap = documentObject.createElement("script");
          bootstrap.type = "module";
          bootstrap.src = bootstrapUrl;
          bootstrap.addEventListener?.("error", () => finish(NOTATION_RUNTIME_STATES.ERROR), { once: true });
          bootstrap.addEventListener?.("load", () => {
            if (!settled) finish(NOTATION_RUNTIME_STATES.ERROR);
          }, { once: true });
          documentObject.head.append(bootstrap);
        } catch {
          finish(NOTATION_RUNTIME_STATES.ERROR);
        }
      })();
    });
  }

  async function ensureReady() {
    if (isReady()) return { state: NOTATION_RUNTIME_STATES.READY };
    if (!installPromise) {
      installPromise = install().finally(() => {
        if (!isReady()) installPromise = null;
      });
    }
    return installPromise;
  }

  return Object.freeze({
    isInstallable,
    isReady,
    ensureReady,
  });
}
