import { getAuthenticatedStudentId } from "../auth/session.js";
import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";
import { canReadPublication } from "./accessPolicy.js";
import { assertPublishablePracticePackage } from "./packageEligibility.js";
import { createDeliveryItem } from "./deliveryItem.js";
import { createPublication } from "./publication.js";

function requireStudentId(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("unauthenticated");
  }

  return studentId;
}

function publishPracticePackage({
  packageRepository,
  publicationRepository,
  pkg,
  publication,
}) {
  assertPublishablePracticePackage(pkg);

  const normalizedPublication = createPublication(publication);

  if (normalizedPublication.packageId !== pkg.packageId) {
    throw new Error("publication packageId does not match package");
  }

  createDeliveryItem(normalizedPublication, pkg);

  if (
    publicationRepository.getById(normalizedPublication.publicationId) !==
    null
  ) {
    throw new Error("publicationId already exists");
  }

  const storedPackage = packageRepository.put(pkg);
  const storedPublication = publicationRepository.save(normalizedPublication);

  return createDeliveryItem(storedPublication, storedPackage);
}

export function createSharingService({
  packageRepository,
  publicationRepository,
}) {
  return Object.freeze({
    listPublicPool({ session }) {
      requireStudentId(session);

      return publicationRepository.listActivePublic().map((publication) => {
        if (
          publication.scope !== PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL ||
          !canReadPublication({ session, publication })
        ) {
          throw new Error("forbidden");
        }

        const pkg = packageRepository.getByPackageId(publication.packageId);

        if (pkg === null) {
          throw new Error("package not found");
        }

        return createDeliveryItem(publication, pkg);
      });
    },

    listMyWork({ session }) {
      const studentId = requireStudentId(session);

      return publicationRepository
        .listActivePrivateForStudent(studentId)
        .map((publication) => {
          if (
            publication.scope !== PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE ||
            publication.recipientStudentId !== studentId ||
            !canReadPublication({ session, publication })
          ) {
            throw new Error("forbidden");
          }

          const pkg = packageRepository.getByPackageId(publication.packageId);

          if (pkg === null) {
            throw new Error("package not found");
          }

          return createDeliveryItem(publication, pkg);
        });
    },

    getPracticeItem({ session, publicationId }) {
      requireStudentId(session);

      const publication = publicationRepository.getById(publicationId);

      if (publication === null) {
        throw new Error("publication not found");
      }

      if (!canReadPublication({ session, publication })) {
        throw new Error("forbidden");
      }

      const pkg = packageRepository.getByPackageId(publication.packageId);

      if (pkg === null) {
        throw new Error("package not found");
      }

      return createDeliveryItem(publication, pkg);
    },
  });
}

export function createSharingManagementService({
  packageRepository,
  publicationRepository,
}) {
  return Object.freeze({
    publish({ package: pkg, publication }) {
      return publishPracticePackage({
        packageRepository,
        publicationRepository,
        pkg,
        publication,
      });
    },

    revoke({ publicationId, revokedAt }) {
      const publication = publicationRepository.revoke(
        publicationId,
        revokedAt,
      );

      if (publication === null) {
        throw new Error("publication not found");
      }

      return publication;
    },
  });
}
