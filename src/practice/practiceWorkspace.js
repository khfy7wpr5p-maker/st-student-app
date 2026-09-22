import { assertPublishablePracticePackage } from "../sharing/packageEligibility.js";
import {
  PRACTICE_CAPABILITY_STATES,
  derivePracticeCapabilities,
} from "./practiceCapabilities.js";

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function safePlaybackQuality(playbackPort, pkg, playbackAvailable) {
  if (!playbackAvailable) {
    return null;
  }

  try {
    const value = playbackPort?.getPlaybackQualityForPackage?.(pkg);
    return value === "FULL" || value === "APPROXIMATE"
      ? value
      : null;
  } catch {
    return null;
  }
}

function safeReferenceTempo(playbackPort, pkg, playbackAvailable) {
  if (!playbackAvailable) {
    return null;
  }

  try {
    return positiveFinite(
      playbackPort?.getReferenceTempoForPackage?.(pkg),
    );
  } catch {
    return null;
  }
}

function requireDeliveryItem(deliveryItem) {
  if (
    deliveryItem === null ||
    typeof deliveryItem !== "object" ||
    deliveryItem.publication === null ||
    typeof deliveryItem.publication !== "object" ||
    typeof deliveryItem.publication.publicationId !== "string" ||
    deliveryItem.publication.publicationId.trim().length === 0
  ) {
    throw new TypeError("authorized practice delivery item required");
  }

  assertPublishablePracticePackage(deliveryItem.package);
  return deliveryItem;
}

export function createPracticeWorkspace({
  deliveryItem,
  notationRuntimeAvailable,
  playbackPort = null,
}) {
  const item = requireDeliveryItem(deliveryItem);
  const pkg = item.package;

  const capabilities = derivePracticeCapabilities({
    pkg,
    notationRuntimeAvailable,
    playbackPort,
  });

  const playbackAvailable =
    capabilities.playback === PRACTICE_CAPABILITY_STATES.AVAILABLE;
  const playbackQuality = safePlaybackQuality(
    playbackPort,
    pkg,
    playbackAvailable,
  );
  const referenceTempo = safeReferenceTempo(
    playbackPort,
    pkg,
    playbackAvailable,
  );

  const viewModel = Object.freeze({
    publicationId: item.publication.publicationId,
    packageId: pkg.packageId,
    title: pkg.title,
    playbackQuality,
    capabilities,
    practice: Object.freeze({
      tempoBpm:
        referenceTempo ??
        positiveFinite(pkg.practice?.tempoBpm),
      measureRepeatEnabled: false,
    }),
  });

  const renderSource = Object.freeze({
    kind: "musicxml",
    musicXml: pkg.content.score.data,
    sourceId: pkg.packageId,
  });

  return Object.freeze({
    viewModel,
    renderSource,
  });
}

const PRACTICE_CAPABILITY_NAMES = Object.freeze([
  "notation",
  "playback",
  "tempoChange",
  "measureRepeat",
  "guitarTab",
  "violin",
]);

export function withPracticeCapability(viewModel, name, capability) {
  if (!PRACTICE_CAPABILITY_NAMES.includes(name)) {
    throw new TypeError("unsupported practice capability");
  }

  if (!Object.values(PRACTICE_CAPABILITY_STATES).includes(capability)) {
    throw new TypeError("unsupported practice capability state");
  }

  return Object.freeze({
    ...viewModel,
    capabilities: Object.freeze({
      ...viewModel.capabilities,
      [name]: capability,
    }),
  });
}

export function withNotationCapability(viewModel, capability) {
  return withPracticeCapability(viewModel, "notation", capability);
}


export function withPracticeTempo(viewModel, bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new TypeError("tempo must be a positive finite number");
  }

  return Object.freeze({
    ...viewModel,
    practice: Object.freeze({
      ...viewModel.practice,
      tempoBpm: bpm,
    }),
  });
}

export function withPracticeMeasureRepeatEnabled(viewModel, enabled) {
  if (typeof enabled !== "boolean") {
    throw new TypeError("repeat enabled must be boolean");
  }

  return Object.freeze({
    ...viewModel,
    practice: Object.freeze({
      ...viewModel.practice,
      measureRepeatEnabled: enabled,
    }),
  });
}
