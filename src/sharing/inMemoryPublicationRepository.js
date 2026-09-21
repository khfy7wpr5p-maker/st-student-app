import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";
import { createPublication } from "./publication.js";

export function createInMemoryPublicationRepository() {
  const publications = new Map();

  return Object.freeze({
    save(publication) {
      if (publications.has(publication.publicationId)) {
        throw new Error("publicationId already exists");
      }

      publications.set(publication.publicationId, publication);
      return publication;
    },

    getById(publicationId) {
      return publications.get(publicationId) ?? null;
    },

    listActivePublic() {
      return [...publications.values()].filter(
        (publication) =>
          publication.scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL &&
          publication.revokedAt === null,
      );
    },

    listActivePrivateForStudent(studentId) {
      return [...publications.values()].filter(
        (publication) =>
          publication.scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE &&
          publication.recipientStudentId === studentId &&
          publication.revokedAt === null,
      );
    },

    revoke(publicationId, revokedAt) {
      const current = publications.get(publicationId);

      if (current === undefined) {
        return null;
      }

      if (current.revokedAt !== null) {
        return current;
      }

      const replacement = createPublication({
        ...current,
        revokedAt,
      });
      publications.set(publicationId, replacement);
      return replacement;
    },
  });
}
