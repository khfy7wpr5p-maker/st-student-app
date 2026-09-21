import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";
import { assertPublishablePracticePackage } from "./packageEligibility.js";
import { createPublication } from "./publication.js";

function assertPublicationMatchesPackage(pkg, publication) {
  const packagePublication = pkg.publication;

  const sameScope = packagePublication.scope === publication.scope;
  const sameRecipient =
    publication.scope !== PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE ||
    packagePublication.recipientStudentId === publication.recipientStudentId;

  if (!sameScope || !sameRecipient) {
    throw new Error(
      "publication does not match package publication metadata",
    );
  }
}

export function createDeliveryItem(publication, pkg) {
  const normalizedPublication = createPublication(publication);
  assertPublishablePracticePackage(pkg);
  assertPublicationMatchesPackage(pkg, normalizedPublication);

  return Object.freeze({
    publication: normalizedPublication,
    package: pkg,
  });
}
