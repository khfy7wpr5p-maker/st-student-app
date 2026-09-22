import {
  PLAYBACK_QUALITIES,
  assertPlaybackPlan,
} from "./playbackPlan.js";
import { compileApproximateMusicXmlPlayback } from "./musicXmlApproximatePlayback.js";

export function createPlaybackPlanResolver({
  trustedTimingProvider = null,
  approximateCompiler = compileApproximateMusicXmlPlayback,
} = {}) {
  if (typeof approximateCompiler !== "function") {
    throw new TypeError("approximate compiler required");
  }

  return Object.freeze({
    resolvePackage(pkg) {
      const packageId = pkg?.packageId;

      if (typeof packageId !== "string" || packageId.length === 0) {
        return null;
      }

      if (trustedTimingProvider !== null) {
        if (
          typeof trustedTimingProvider?.resolveTrustedPlan !== "function"
        ) {
          return null;
        }

        let trusted;

        try {
          trusted = trustedTimingProvider.resolveTrustedPlan(pkg);
        } catch {
          return null;
        }

        if (trusted !== null) {
          try {
            return assertPlaybackPlan(trusted, {
              packageId,
              allowedQuality: PLAYBACK_QUALITIES.FULL,
            });
          } catch {
            return null;
          }
        }
      }

      let approximate;

      try {
        approximate = approximateCompiler(pkg);
      } catch {
        return null;
      }

      if (approximate === null) {
        return null;
      }

      try {
        return assertPlaybackPlan(approximate, {
          packageId,
          allowedQuality: PLAYBACK_QUALITIES.APPROXIMATE,
        });
      } catch {
        return null;
      }
    },
  });
}
