import { assertPublishablePracticePackage } from "./packageEligibility.js";

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export function createInMemoryPackageRepository() {
  const packages = new Map();

  return Object.freeze({
    put(pkg) {
      assertPublishablePracticePackage(pkg);

      if (packages.has(pkg.packageId)) {
        throw new Error("packageId already exists");
      }

      const snapshot = deepFreeze(structuredClone(pkg));
      packages.set(snapshot.packageId, snapshot);
      return snapshot;
    },

    getByPackageId(packageId) {
      return packages.get(packageId) ?? null;
    },
  });
}
