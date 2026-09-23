import { createPrivateAssignment } from "../contracts/privateAssignment.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function createInMemoryAssignmentRepository(
  initialAssignments = [],
) {
  if (!Array.isArray(initialAssignments)) {
    throw new TypeError(
      "initial PrivateAssignment collection must be an array",
    );
  }

  const assignments = new Map();

  for (const source of initialAssignments) {
    const assignment = createPrivateAssignment(source);

    if (assignments.has(assignment.assignmentId)) {
      throw new Error("assignmentId already exists");
    }

    assignments.set(assignment.assignmentId, assignment);
  }

  return Object.freeze({
    listForStudent(studentId) {
      if (!hasText(studentId)) {
        throw new TypeError("studentId must be a non-empty string");
      }

      const stableStudentId = studentId.trim();

      return Object.freeze(
        [...assignments.values()].filter(
          (assignment) =>
            assignment.studentId === stableStudentId,
        ),
      );
    },

    getById(assignmentId) {
      if (!hasText(assignmentId)) {
        throw new TypeError("assignmentId must be a non-empty string");
      }

      return assignments.get(assignmentId.trim()) ?? null;
    },
  });
}
