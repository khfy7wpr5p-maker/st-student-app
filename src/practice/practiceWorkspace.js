import { assertPublishablePracticePackage } from "../sharing/packageEligibility.js";
import {
  PRACTICE_CAPABILITY_STATES,
  derivePracticeCapabilities,
} from "./practiceCapabilities.js";

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
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

  const viewModel = Object.freeze({
    publicationId: item.publication.publicationId,
    packageId: pkg.packageId,
    title: pkg.title,
    capabilities,
    practice: Object.freeze({
      tempoBpm: positiveFinite(pkg.practice?.tempoBpm),
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
