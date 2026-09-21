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

const controller = createStudentAppController({
  sharingService: unconfiguredSharingService,
});

mountStudentApp({
  root,
  controller,
});
