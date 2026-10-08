const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function createAccountLifecycleCoordinator({
  authAdapter,
  presenceWriter,
  usageReporter = null,
} = {}) {
  if (typeof authAdapter?.getFirebaseUid !== "function") {
    throw new TypeError("authAdapter.getFirebaseUid is required");
  }
  if (
    typeof presenceWriter?.start !== "function" ||
    typeof presenceWriter?.stop !== "function" ||
    typeof presenceWriter?.dispose !== "function"
  ) {
    throw new TypeError("presenceWriter lifecycle is incomplete");
  }
  if (
    usageReporter !== null &&
    typeof usageReporter?.reportAuthenticatedBoot !== "function"
  ) {
    throw new TypeError("usageReporter lifecycle is incomplete");
  }

  async function safeStopPresence() {
    try {
      await presenceWriter.stop();
    } catch {
      // Presence is informational and must never block Student App auth state.
    }
  }

  async function handleSession(session) {
    if (session === null || session === undefined) {
      await safeStopPresence();
      return;
    }

    let firebaseUid = null;
    try {
      firebaseUid = authAdapter.getFirebaseUid();
    } catch {
      firebaseUid = null;
    }

    if (!hasText(firebaseUid)) {
      await safeStopPresence();
      return;
    }

    const uid = firebaseUid.trim();
    const operations = [
      Promise.resolve().then(() => presenceWriter.start(uid)),
    ];

    if (usageReporter !== null) {
      operations.push(
        Promise.resolve().then(() =>
          usageReporter.reportAuthenticatedBoot(uid),
        ),
      );
    }

    await Promise.allSettled(operations);
  }

  function dispose() {
    try {
      presenceWriter.dispose();
    } catch {
      // Page teardown must not surface provider cleanup details.
    }
  }

  return Object.freeze({ handleSession, dispose });
}
