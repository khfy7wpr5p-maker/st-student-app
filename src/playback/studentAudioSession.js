export function createStudentAudioSession({
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
} = {}) {
  const supported = typeof AudioContextCtor === "function";
  let context = null;
  let disposed = false;
  let disposePromise = null;

  function isSupported() {
    return supported;
  }

  function getContext() {
    if (disposed || !supported) return null;
    if (context === null) {
      context = new AudioContextCtor();
    }
    return context;
  }

  function audioContextFactory() {
    return getContext();
  }

  function dispose() {
    if (disposePromise !== null) return disposePromise;

    disposed = true;
    const ownedContext = context;
    context = null;

    disposePromise = (async () => {
      if (
        ownedContext !== null &&
        ownedContext.state !== "closed" &&
        typeof ownedContext.close === "function"
      ) {
        try {
          await ownedContext.close();
        } catch {
          // Audio shutdown is best-effort and must not escape into Student UI state.
        }
      }
    })();

    return disposePromise;
  }

  return Object.freeze({
    isSupported,
    audioContextFactory,
    getContext,
    dispose,
  });
}
