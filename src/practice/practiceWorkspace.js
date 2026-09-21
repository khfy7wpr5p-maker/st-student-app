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

export function withNotationCapability(viewModel, capability) {
  if (!Object.values(PRACTICE_CAPABILITY_STATES).includes(capability)) {
    throw new TypeError("unsupported notation capability state");
  }

  return Object.freeze({
    ...viewModel,
    capabilities: Object.freeze({
      ...viewModel.capabilities,
      notation: capability,
    }),
  });
}
