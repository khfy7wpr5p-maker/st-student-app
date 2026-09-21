const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function createStudentSession({
  studentId,
  email = null,
  displayName = null,
}) {
  if (!hasText(studentId)) {
    throw new TypeError("studentId must be a non-empty string");
  }

  return Object.freeze({
    studentId,
    email: hasText(email) ? email : null,
    displayName: hasText(displayName) ? displayName : null,
  });
}

export function getAuthenticatedStudentId(session) {
  if (
    session === null ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    !hasText(session.studentId)
  ) {
    return null;
  }

  return session.studentId;
}

export function isAuthenticatedStudent(session) {
  return getAuthenticatedStudentId(session) !== null;
}
