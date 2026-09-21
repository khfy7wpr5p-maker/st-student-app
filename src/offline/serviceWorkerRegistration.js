export async function registerStudentAppServiceWorker({
  navigatorObject = globalThis.navigator,
} = {}) {
  if (
    navigatorObject === null ||
    typeof navigatorObject?.serviceWorker?.register !== "function"
  ) {
    return Object.freeze({ registered: false });
  }

  try {
    await navigatorObject.serviceWorker.register("./service-worker.js", {
      scope: "./",
    });
    return Object.freeze({ registered: true });
  } catch {
    return Object.freeze({ registered: false });
  }
}
