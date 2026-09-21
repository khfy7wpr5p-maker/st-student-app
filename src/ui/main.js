import { createDefaultOfflineInfrastructure } from "../offline/defaultOfflineInfrastructure.js";
import { registerStudentAppServiceWorker } from "../offline/serviceWorkerRegistration.js";
import { createStNotationAdapter } from "../practice/notationAdapter.js";
import { createStudentAppController } from "./studentAppController.js";
import { mountStudentApp } from "./mountStudentApp.js";

const unconfiguredSharingService = Object.freeze({
  listPublicPool() {
    throw new Error("sharing service is not configured");
  },

  listMyWork() {
    throw new Error("sharing service is not configured");
  },

  getPracticeItem() {
    throw new Error("sharing service is not configured");
  },
});

const root = document.querySelector("#app");
const notationAdapter = createStNotationAdapter();
const offlineInfrastructure = createDefaultOfflineInfrastructure({
  onlineSharingService: unconfiguredSharingService,
});

const controller = createStudentAppController({
  sharingService: offlineInfrastructure.sharingService,
  notationAdapter,
});

mountStudentApp({
  root,
  controller,
  notationAdapter,
  connectivityPort: offlineInfrastructure.connectivityPort,
});

registerStudentAppServiceWorker().catch(() => {});
