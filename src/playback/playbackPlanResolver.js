import {
  PLAYBACK_QUALITIES,
  assertPlaybackPlan,
} from "./playbackPlan.js";
import { compileApproximateMusicXmlPlayback } from "./musicXmlApproximatePlayback.js";

function exactScoreMusicXml(pkg) {
  return (
    pkg?.content?.score?.format === "musicxml" &&
    typeof pkg?.content?.score?.data === "string"
      ? pkg.content.score.data
      : null
  );
}

function exactScoreProvenance(pkg) {
  const musicXml = exactScoreMusicXml(pkg);

  return musicXml === null
    ? null
    : Object.freeze({
        kind: "EXACT_SCORE_SOURCE",
        musicXml,
      });
}

export function createPlaybackPlanResolver({
  trustedTimingProvider = null,
  approximateCompiler = compileApproximateMusicXmlPlayback,
} = {}) {
  if (typeof approximateCompiler !== "function") {
    throw new TypeError("approximate compiler required");
  }

  function resolvePackageContext(pkg) {
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
        let plan;

        try {
          plan = assertPlaybackPlan(trusted, {
            packageId,
            allowedQuality: PLAYBACK_QUALITIES.FULL,
          });
        } catch {
          return null;
        }

        let timingProvenance = null;

        if (
          typeof trustedTimingProvider.resolveTrustedProvenance ===
          "function"
        ) {
          try {
            const candidate =
              trustedTimingProvider.resolveTrustedProvenance(pkg, plan);
            const expectedMusicXml = exactScoreMusicXml(pkg);

            if (
              candidate !== null &&
              typeof candidate === "object" &&
              !Array.isArray(candidate) &&
              candidate.kind === "EXACT_SCORE_SOURCE" &&
              typeof candidate.musicXml === "string" &&
              expectedMusicXml !== null &&
              candidate.musicXml === expectedMusicXml
            ) {
              timingProvenance = Object.freeze({
                kind: "EXACT_SCORE_SOURCE",
                musicXml: expectedMusicXml,
              });
            }
          } catch {
            timingProvenance = null;
          }
        }

        return Object.freeze({
          plan,
          timingProvenance,
        });
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

    let plan;

    try {
      plan = assertPlaybackPlan(approximate, {
        packageId,
        allowedQuality: PLAYBACK_QUALITIES.APPROXIMATE,
      });
    } catch {
      return null;
    }

    return Object.freeze({
      plan,
      timingProvenance: exactScoreProvenance(pkg),
    });
  }

  return Object.freeze({
    resolvePackage(pkg) {
      return resolvePackageContext(pkg)?.plan ?? null;
    },

    resolvePackageContext,
  });
}
