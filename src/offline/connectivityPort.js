export const CONNECTIVITY_STATES = Object.freeze({
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
});

export function createBrowserConnectivityPort({
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
} = {}) {
  const getState = () =>
    navigatorObject?.onLine === false
      ? CONNECTIVITY_STATES.OFFLINE
      : CONNECTIVITY_STATES.ONLINE;

  return Object.freeze({
    getState,

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("connectivity listener must be a function");
      }

      if (
        windowObject === null ||
        typeof windowObject?.addEventListener !== "function"
      ) {
        return () => {};
      }

      const emit = () => listener(getState());

      windowObject.addEventListener("online", emit);
      windowObject.addEventListener("offline", emit);

      return () => {
        windowObject.removeEventListener?.("online", emit);
        windowObject.removeEventListener?.("offline", emit);
      };
    },
  });
}
