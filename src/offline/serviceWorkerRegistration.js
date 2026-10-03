export async function registerStudentAppServiceWorker({
  navigatorObject = globalThis.navigator,
  locationObject = globalThis.location,
} = {}) {
  if (
    navigatorObject === null ||
    typeof navigatorObject?.serviceWorker?.register !== "function"
  ) {
    return Object.freeze({ registered: false });
  }

  const serviceWorker =
    navigatorObject.serviceWorker;
  const hadController =
    serviceWorker.controller !== null &&
    serviceWorker.controller !== undefined;
  let reloaded = false;
  let controllerChangeHandler = null;

  if (
    hadController &&
    typeof serviceWorker.addEventListener === "function" &&
    typeof locationObject?.reload === "function"
  ) {
    controllerChangeHandler = () => {
      if (reloaded) {
        return;
      }
      reloaded = true;
      locationObject.reload();
    };
    serviceWorker.addEventListener(
      "controllerchange",
      controllerChangeHandler,
    );
  }

  try {
    const registration = await serviceWorker.register(
      "./service-worker.js",
      {
        scope: "./",
        updateViaCache: "none",
      },
    );

    if (typeof registration?.update === "function") {
      try {
        await registration.update();
      } catch {
        // An update check may fail while the student is offline. The existing
        // registered worker must remain usable instead of downgrading the app.
      }
    }

    return Object.freeze({ registered: true });
  } catch {
    if (
      controllerChangeHandler !== null &&
      typeof serviceWorker.removeEventListener === "function"
    ) {
      serviceWorker.removeEventListener(
        "controllerchange",
        controllerChangeHandler,
      );
    }
    return Object.freeze({ registered: false });
  }
}
