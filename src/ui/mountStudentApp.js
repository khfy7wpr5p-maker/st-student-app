import { renderStudentApp } from "./renderStudentApp.js";
import { dispatchStudentAppAction } from "./shellActions.js";

export function mountStudentApp({
  root,
  controller,
  requestSignIn,
}) {
  if (
    root === null ||
    typeof root !== "object" ||
    typeof root.addEventListener !== "function"
  ) {
    throw new TypeError("student app root element is required");
  }

  let status = "";

  function render() {
    root.innerHTML = renderStudentApp(controller.getState(), {
      signInAvailable: typeof requestSignIn === "function",
      status,
    });
  }

  async function onClick(event) {
    const actionElement = event.target?.closest?.("[data-action]");

    if (
      actionElement === null ||
      actionElement === undefined ||
      !root.contains(actionElement)
    ) {
      return;
    }

    const action = actionElement.dataset.action;
    const publicationId = actionElement.dataset.publicationId;

    try {
      status = "";
      await dispatchStudentAppAction({
        action,
        publicationId,
        controller,
        requestSignIn,
      });
    } catch {
      status = "İşlem tamamlanamadı.";
    }

    render();
  }

  root.addEventListener("click", onClick);
  render();

  return Object.freeze({
    render,

    destroy() {
      root.removeEventListener("click", onClick);
    },
  });
}
