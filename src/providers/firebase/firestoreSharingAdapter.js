import { getAuthenticatedStudentId } from "../../auth/session.js";
import { PRACTICE_PACKAGE_SCOPES } from "../../contracts/practicePackage.js";
import { canReadPublication } from "../../sharing/accessPolicy.js";
import { createDeliveryItem } from "../../sharing/deliveryItem.js";
import { createPublication } from "../../sharing/publication.js";
import { decodeFirestorePackage } from "./firestorePackageTransport.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function isRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requireStudentId(session) {
  const studentId = getAuthenticatedStudentId(session);

  if (studentId === null) {
    throw new Error("unauthenticated");
  }

  return studentId;
}

function requireSdk(sdk) {
  for (const name of ["collection", "doc", "getDocs", "getDoc"]) {
    if (typeof sdk?.[name] !== "function") {
      throw new TypeError("Firestore SDK seam is incomplete");
    }
  }
}

function snapshotExists(snapshot) {
  if (typeof snapshot?.exists === "function") {
    return snapshot.exists();
  }

  return snapshot !== null && snapshot !== undefined;
}

function snapshotData(snapshot) {
  if (typeof snapshot?.data === "function") {
    return snapshot.data();
  }

  return snapshot?.data ?? null;
}

function publicationFromManifest({
  manifest,
  documentId,
  expectedScope,
  studentId,
}) {
  if (!isRecord(manifest)) {
    throw new TypeError("Firestore publication manifest is invalid");
  }

  const publicationId = manifest.publicationId ?? documentId;

  if (
    !hasText(publicationId) ||
    (hasText(manifest.publicationId) &&
      hasText(documentId) &&
      manifest.publicationId !== documentId)
  ) {
    throw new Error("Firestore publication id mismatch");
  }

  if (!hasText(manifest.packageId)) {
    throw new TypeError("Firestore packageId is invalid");
  }

  if (!hasText(manifest.title)) {
    throw new TypeError("Firestore publication title is invalid");
  }

  if (manifest.scope !== expectedScope) {
    throw new Error("Firestore publication scope mismatch");
  }

  if (expectedScope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL) {
    if ("recipientStudentId" in manifest) {
      throw new Error("public publication contains recipient");
    }

    return Object.freeze({
      publication: createPublication({
        publicationId,
        packageId: manifest.packageId,
        scope: expectedScope,
        publishedAt: manifest.publishedAt,
        revokedAt: manifest.revokedAt ?? null,
      }),
      title: manifest.title,
      manifest,
    });
  }

  if (
    "recipientStudentId" in manifest &&
    manifest.recipientStudentId !== studentId
  ) {
    throw new Error("private publication recipient mismatch");
  }

  return Object.freeze({
    publication: createPublication({
      publicationId,
      packageId: manifest.packageId,
      scope: expectedScope,
      recipientStudentId: studentId,
      publishedAt: manifest.publishedAt,
      revokedAt: manifest.revokedAt ?? null,
    }),
    title: manifest.title,
    manifest,
  });
}

function summaryItem(normalized) {
  return Object.freeze({
    publication: normalized.publication,
    package: Object.freeze({
      packageId: normalized.publication.packageId,
      title: normalized.title,
    }),
  });
}

export function createFirestoreSharingAdapter({ db, sdk }) {
  requireSdk(sdk);

  async function listCollection({
    session,
    segments,
    expectedScope,
    studentId,
  }) {
    const snapshot = await sdk.getDocs(sdk.collection(db, ...segments));
    const documents = Array.isArray(snapshot?.docs) ? snapshot.docs : [];

    const items = [];

    for (const document of documents) {
      const normalized = publicationFromManifest({
        manifest: snapshotData(document),
        documentId: document.id,
        expectedScope,
        studentId,
      });

      if (normalized.publication.revokedAt !== null) {
        continue;
      }

      if (!canReadPublication({ session, publication: normalized.publication })) {
        throw new Error("forbidden");
      }

      items.push(summaryItem(normalized));
    }

    return items;
  }

  async function readDocument(segments) {
    const snapshot = await sdk.getDoc(sdk.doc(db, ...segments));

    if (!snapshotExists(snapshot)) {
      return null;
    }

    return Object.freeze({
      id: snapshot.id ?? segments.at(-1),
      data: snapshotData(snapshot),
      segments,
    });
  }

  async function locatePracticeManifest({
    session,
    studentId,
    publicationId,
  }) {
    const privateSegments = [
      "students",
      studentId,
      "publications",
      publicationId,
    ];
    const privateDocument = await readDocument(privateSegments);

    if (privateDocument !== null) {
      return Object.freeze({
        normalized: publicationFromManifest({
          manifest: privateDocument.data,
          documentId: privateDocument.id,
          expectedScope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
          studentId,
        }),
        segments: privateSegments,
      });
    }

    const publicSegments = ["publicPublications", publicationId];
    const publicDocument = await readDocument(publicSegments);

    if (publicDocument === null) {
      throw new Error("publication not found");
    }

    return Object.freeze({
      normalized: publicationFromManifest({
        manifest: publicDocument.data,
        documentId: publicDocument.id,
        expectedScope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        studentId,
      }),
      segments: publicSegments,
    });
  }

  async function readChunks(segments) {
    const snapshot = await sdk.getDocs(
      sdk.collection(db, ...segments, "chunks"),
    );
    const documents = Array.isArray(snapshot?.docs) ? snapshot.docs : [];

    return documents.map((document) => {
      const data = snapshotData(document);

      if (!isRecord(data)) {
        throw new TypeError("Firestore chunk document is invalid");
      }

      return Object.freeze({
        index: data.index,
        data: data.data,
      });
    });
  }

  return Object.freeze({
    async listPublicPool({ session }) {
      const studentId = requireStudentId(session);

      return listCollection({
        session,
        segments: ["publicPublications"],
        expectedScope: PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL,
        studentId,
      });
    },

    async listMyWork({ session }) {
      const studentId = requireStudentId(session);

      return listCollection({
        session,
        segments: ["students", studentId, "publications"],
        expectedScope: PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE,
        studentId,
      });
    },

    async getPracticeItem({ session, publicationId }) {
      const studentId = requireStudentId(session);

      if (!hasText(publicationId)) {
        throw new TypeError("publicationId must be a non-empty string");
      }

      const located = await locatePracticeManifest({
        session,
        studentId,
        publicationId,
      });
      const publication = located.normalized.publication;

      if (publication.revokedAt !== null) {
        throw new Error("publication revoked");
      }

      if (!canReadPublication({ session, publication })) {
        throw new Error("forbidden");
      }

      const chunks = await readChunks(located.segments);
      const pkg = decodeFirestorePackage({
        manifest: located.normalized.manifest,
        chunks,
      });

      if (pkg.packageId !== publication.packageId) {
        throw new Error("Firestore package id mismatch");
      }

      return createDeliveryItem(publication, pkg);
    },

    async getPublicationStatus({ session, publicationId, scope }) {
      const studentId = requireStudentId(session);

      if (!hasText(publicationId)) {
        throw new TypeError("publicationId must be a non-empty string");
      }

      let segments;
      let expectedScope;

      if (scope === PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL) {
        segments = ["publicPublications", publicationId];
        expectedScope = PRACTICE_PACKAGE_SCOPES.PUBLIC_POOL;
      } else if (scope === PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE) {
        segments = [
          "students",
          studentId,
          "publications",
          publicationId,
        ];
        expectedScope = PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE;
      } else {
        throw new TypeError("publication scope is invalid");
      }

      const document = await readDocument(segments);

      if (document === null) {
        throw new Error("publication status unavailable");
      }

      const normalized = publicationFromManifest({
        manifest: document.data,
        documentId: document.id,
        expectedScope,
        studentId,
      });

      if (normalized.publication.revokedAt !== null) {
        return Object.freeze({ state: "REVOKED" });
      }

      if (
        !canReadPublication({
          session,
          publication: normalized.publication,
        })
      ) {
        throw new Error("forbidden");
      }

      return Object.freeze({
        state: "ACTIVE",
        packageId: normalized.publication.packageId,
      });
    },
  });
}
