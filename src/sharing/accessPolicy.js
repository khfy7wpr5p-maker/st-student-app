import { getAuthenticatedStudentId } from "../auth/session.js";
import { PRACTICE_PACKAGE_SCOPES } from "../contracts/practicePackage.js";

export function canReadPublication({ session, publication }) {
  const studentId = getAuthenticatedStudentId(session);

  if (
    studentId === null ||
    publication === null ||
    typeof publication !== "object" ||
    Array.isArray(publication) ||
    publication.revokedAt !== null
  ) {
    return false;
  }

  if (publication.scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL) {
    return true;
  }

  return (
    publication.scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE &&
    publication.recipientStudentId === studentId
  );
}
