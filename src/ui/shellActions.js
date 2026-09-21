const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export async function dispatchStudentAppAction({
  action,
  publicationId,
  controller,
  requestSignIn,
}) {
  switch (action) {
    case "show-public-pool":
      return controller.showPublicPool();

    case "show-my-work":
      return controller.showMyWork();

    case "go-home":
      return controller.showHome();

    case "open-practice":
      if (!hasText(publicationId)) {
        throw new Error("publication id required");
      }
      return controller.openPractice(publicationId);

    case "sign-out":
      return controller.signOut();

    case "request-sign-in": {
      if (typeof requestSignIn !== "function") {
        throw new Error("sign-in provider is not configured");
      }

      const session = await requestSignIn();
      return controller.attachSession(session);
    }

    default:
      throw new Error("unsupported student app action");
  }
}
