const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export async function dispatchStudentAppAction({
  action,
  publicationId,
  poolItemId,
  assignmentId,
  assignmentState,
  tempoBpm,
  repeatEnabled,
  credentials,
  controller,
  requestSignIn,
  requestSignOut,
}) {
  switch (action) {
    case "show-public-pool":
      return controller.showPublicPool();

    case "show-my-work":
      return controller.showMyWork();

    case "show-work-folder":
      if (!hasText(assignmentState)) {
        throw new Error("assignment state required");
      }
      return controller.showMyWork(assignmentState);

    case "open-pool-item":
      if (!hasText(poolItemId)) {
        throw new Error("pool item id required");
      }
      return controller.openPoolItem(poolItemId);

    case "open-assignment":
      if (!hasText(assignmentId)) {
        throw new Error("assignment id required");
      }
      return controller.openAssignment(assignmentId);

    case "go-home":
      return controller.showHome();

    case "open-practice":
      if (!hasText(publicationId)) {
        throw new Error("publication id required");
      }
      return controller.openPractice(publicationId);

    case "play-practice":
      return controller.playPractice();

    case "pause-practice":
      return controller.pausePractice();

    case "restart-practice":
      return controller.restartPractice();

    case "set-practice-tempo":
      return controller.setPracticeTempo(tempoBpm);

    case "set-measure-repeat":
      return controller.setMeasureRepeatEnabled(repeatEnabled);

    case "sign-out":
      if (typeof requestSignOut !== "function") {
        return controller.signOut();
      }

      try {
        await requestSignOut();
      } finally {
        controller.signOut();
      }
      return undefined;

    case "request-sign-in": {
      if (typeof requestSignIn !== "function") {
        throw new Error("sign-in provider is not configured");
      }

      const session = await requestSignIn(credentials);
      return controller.attachSession(session);
    }

    default:
      throw new Error("unsupported student app action");
  }
}
