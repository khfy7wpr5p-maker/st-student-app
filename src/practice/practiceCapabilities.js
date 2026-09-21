export const PRACTICE_CAPABILITY_STATES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  ERROR: "ERROR",
});

function trueFrom(port, method, pkg) {
  if (typeof port?.[method] !== "function") {
    return false;
  }

  try {
    return port[method](pkg) === true;
  } catch {
    return false;
  }
}

function hasMethods(port, names) {
  return names.every((name) => typeof port?.[name] === "function");
}

export function derivePracticeCapabilities({
  pkg,
  notationRuntimeAvailable,
  playbackPort = null,
}) {
  const playback =
    trueFrom(playbackPort, "canPlayPackage", pkg) &&
    hasMethods(playbackPort, ["playPackage", "pausePackage", "restartPackage"]);

  const allowTempoChange = pkg.practice?.allowTempoChange === true;
  const allowMeasureRepeat = pkg.practice?.allowMeasureRepeat === true;

  return Object.freeze({
    notation: notationRuntimeAvailable === true
      ? PRACTICE_CAPABILITY_STATES.AVAILABLE
      : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    playback: playback
      ? PRACTICE_CAPABILITY_STATES.AVAILABLE
      : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    tempoChange:
      playback &&
      allowTempoChange &&
      trueFrom(playbackPort, "canChangeTempoForPackage", pkg) &&
      typeof playbackPort?.setTempoForPackage === "function"
        ? PRACTICE_CAPABILITY_STATES.AVAILABLE
        : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    measureRepeat:
      playback &&
      allowMeasureRepeat &&
      trueFrom(playbackPort, "canRepeatMeasureForPackage", pkg) &&
      typeof playbackPort?.setMeasureRepeatEnabledForPackage === "function"
        ? PRACTICE_CAPABILITY_STATES.AVAILABLE
        : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    guitarTab: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    violin: PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  });
}
