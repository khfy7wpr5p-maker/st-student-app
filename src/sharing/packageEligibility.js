import { validatePracticePackage } from "../contracts/practicePackage.js";

export function assertPublishablePracticePackage(pkg) {
  const result = validatePracticePackage(pkg);

  if (!result.ok) {
    throw new TypeError(
      `practice package is invalid: ${result.errors.join("; ")}`,
    );
  }

  return pkg;
}
