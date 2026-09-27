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

const VIOLIN_DESCRIPTOR_KEYS = new Set([
  "schemaVersion",
  "targetPartId",
  "position",
  "stringLengthMm",
]);

export function readViolinConfiguration(pkg) {
  const value = pkg?.content?.violin;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !VIOLIN_DESCRIPTOR_KEYS.has(key)) ||
    value.schemaVersion !== 1 ||
    typeof value.targetPartId !== "string" ||
    value.targetPartId.length === 0 ||
    value.targetPartId.length > 128 ||
    value.targetPartId !== value.targetPartId.trim() ||
    value.targetPartId.includes("\u0000") ||
    value.position !== 1 ||
    (value.stringLengthMm !== undefined &&
      (!Number.isFinite(value.stringLengthMm) ||
        value.stringLengthMm < 250 ||
        value.stringLengthMm > 400))
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1,
    targetPartId: value.targetPartId,
    position: 1,
    ...(value.stringLengthMm === undefined
      ? {}
      : { stringLengthMm: value.stringLengthMm }),
  });
}

function hasExactScorePlaybackSource(playbackPort, pkg) {
  if (
    typeof playbackPort?.getScoreFollowPlaybackContextForPackage !== "function" ||
    typeof pkg?.content?.score?.data !== "string"
  ) {
    return false;
  }

  try {
    const context =
      playbackPort.getScoreFollowPlaybackContextForPackage(pkg);
    return (
      context !== null &&
      typeof context === "object" &&
      context.plan?.packageId === pkg?.packageId &&
      context.timingProvenance?.kind === "EXACT_SCORE_SOURCE" &&
      context.timingProvenance?.musicXml === pkg.content.score.data
    );
  } catch {
    return false;
  }
}

function hasGuitarTabMusicXml(pkg) {
  const tab = pkg?.content?.guitarTab;
  return (
    tab !== null &&
    typeof tab === "object" &&
    !Array.isArray(tab) &&
    tab.format === "musicxml" &&
    typeof tab.data === "string" &&
    tab.data.trim().length > 0 &&
    Object.keys(tab).every(
      (key) => key === "format" || key === "data",
    )
  );
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
    guitarTab:
      notationRuntimeAvailable === true &&
      hasGuitarTabMusicXml(pkg)
        ? PRACTICE_CAPABILITY_STATES.AVAILABLE
        : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
    violin:
      playback &&
      readViolinConfiguration(pkg) !== null &&
      hasExactScorePlaybackSource(playbackPort, pkg)
        ? PRACTICE_CAPABILITY_STATES.AVAILABLE
        : PRACTICE_CAPABILITY_STATES.UNAVAILABLE,
  });
}