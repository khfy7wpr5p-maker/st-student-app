import { mountStudentApp } from "./mountStudentApp.js";

const IMMEDIATE_NAVIGATION_ACTIONS = new Set([
  "show-public-pool",
  "show-my-work",
  "show-work-folder",
  "show-shared-request-pool",
]);

const LOADING_TEXT = "Yükleniyor…";

export function mountStudentAppPerfA(options = {}) {
  const { root, controller } = options;

  if (
    root === null ||
    typeof root?.addEventListener !== "function" ||
    typeof controller?.getState !== "function"
  ) {
    return mountStudentApp(options);
  }

  let mounted = null;
  let destroyed = false;
  let paintGeneration = 0;

  const queueMicrotaskSafe = (callback) => {
    const queue =
      root.ownerDocument?.defaultView?.queueMicrotask ??
      globalThis.queueMicrotask;
    queue(callback);
  };

  const synchronizePendingStatus = () => {
    if (destroyed) {
      return;
    }

    const statusNode = root.querySelector?.(".app-status") ?? null;
    if (statusNode === null) {
      return;
    }

    if (controller.isNavigationPending?.() === true) {
      if (statusNode.textContent !== LOADING_TEXT) {
        statusNode.textContent = LOADING_TEXT;
      }
      return;
    }

    if (statusNode.textContent === LOADING_TEXT) {
      statusNode.textContent = "";
    }
  };

  const settleStatusAfter = (result) => {
    if (result === null || typeof result?.then !== "function") {
      queueMicrotaskSafe(synchronizePendingStatus);
      return result;
    }

    Promise.resolve(result)
      .finally(() => {
        queueMicrotaskSafe(synchronizePendingStatus);
      })
      .catch(() => {});
    return result;
  };

  const mountedController = Object.freeze({
    ...controller,
    showPublicPool(...args) {
      return settleStatusAfter(controller.showPublicPool(...args));
    },
    showMyWork(...args) {
      return settleStatusAfter(controller.showMyWork(...args));
    },
    showSharedRequestPool(...args) {
      return settleStatusAfter(controller.showSharedRequestPool(...args));
    },
  });

  const schedulePendingPaint = (event) => {
    const actionNode = event?.target?.closest?.("[data-action]") ?? null;
    if (actionNode === null || !root.contains(actionNode)) {
      return;
    }

    if (!IMMEDIATE_NAVIGATION_ACTIONS.has(actionNode.dataset.action)) {
      return;
    }

    const generation = paintGeneration + 1;
    paintGeneration = generation;

    queueMicrotaskSafe(() => {
      if (
        destroyed ||
        mounted === null ||
        generation !== paintGeneration ||
        controller.isNavigationPending?.() !== true
      ) {
        return;
      }

      const renderResult = mounted.render();
      synchronizePendingStatus();
      Promise.resolve(renderResult).catch(() => {});
    });
  };

  mounted = mountStudentApp({
    ...options,
    controller: mountedController,
  });
  root.addEventListener("click", schedulePendingPaint);

  const MutationObserverCtor =
    root.ownerDocument?.defaultView?.MutationObserver ??
    globalThis.MutationObserver;
  const observer =
    typeof MutationObserverCtor === "function"
      ? new MutationObserverCtor(synchronizePendingStatus)
      : null;

  observer?.observe?.(root, {
    childList: true,
    subtree: true,
  });

  return Object.freeze({
    ...mounted,
    async render() {
      const result = await mounted.render();
      synchronizePendingStatus();
      return result;
    },
    async destroy() {
      destroyed = true;
      paintGeneration += 1;
      observer?.disconnect?.();
      root.removeEventListener("click", schedulePendingPaint);
      return mounted.destroy();
    },
  });
}
