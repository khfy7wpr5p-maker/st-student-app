const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,29}$/;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const PUBLICATION_IDS = Object.freeze({
  PUBLIC: "pub-test-public",
  PRIVATE: "pub-test-private",
});

const PACKAGE_IDS = Object.freeze({
  PUBLIC: "pkg-test-public",
  PRIVATE: "pkg-test-private",
});

function requireIdentifier(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${name} is invalid`);
  }

  return value;
}

function requirePublishedAt(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new TypeError("publishedAt is invalid");
  }

  return value;
}

function stringValue(value) {
  return Object.freeze({ stringValue: value });
}

function integerValue(value) {
  return Object.freeze({ integerValue: String(value) });
}

function bytesValue(bytes) {
  return Object.freeze({
    bytesValue: Buffer.from(bytes).toString("base64"),
  });
}

function nullValue() {
  return Object.freeze({ nullValue: null });
}

function makePackage({
  packageId,
  workId,
  title,
  scope,
  studentId,
  publishedAt,
}) {
  const publication =
    scope === "student_private"
      ? Object.freeze({
          scope,
          recipientStudentId: studentId,
        })
      : Object.freeze({ scope });

  return Object.freeze({
    schemaVersion: "1.0.0",
    packageId,
    workId,
    title,
    approvedRevision: Object.freeze({
      revisionId: `rev-${packageId}`,
      state: "teacher_approved",
      approvedAt: publishedAt,
    }),
    publication,
    content: Object.freeze({
      score: Object.freeze({
        format: "musicxml",
        data:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<score-partwise version="4.0">' +
          '<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>' +
          '<part id="P1"><measure number="1"><attributes><divisions>1</divisions>' +
          '<time><beats>4</beats><beat-type>4</beat-type></time>' +
          '<clef><sign>G</sign><line>2</line></clef></attributes>' +
          '<note><rest/><duration>4</duration><type>whole</type></note>' +
          '</measure></part></score-partwise>',
      }),
      canonicalEvents: Object.freeze([]),
    }),
    practice: Object.freeze({
      tempoBpm: 80,
      allowTempoChange: true,
      allowMeasureRepeat: true,
      ttsLanguage: "tr-TR",
    }),
  });
}

function makeManifestFields({
  publicationId,
  packageId,
  title,
  scope,
  studentId,
  publishedAt,
  byteLength,
}) {
  const fields = {
    publicationId: stringValue(publicationId),
    packageId: stringValue(packageId),
    scope: stringValue(scope),
    title: stringValue(title),
    publishedAt: stringValue(publishedAt),
    revokedAt: nullValue(),
    representationVersion: stringValue("1"),
    encoding: stringValue("utf-8-json"),
    chunkCount: integerValue(1),
    totalBytes: integerValue(byteLength),
  };

  if (scope === "student_private") {
    fields.recipientStudentId = stringValue(studentId);
  }

  return Object.freeze(fields);
}

function makeWrite(name, fields) {
  return Object.freeze({
    update: Object.freeze({
      name,
      fields,
    }),
  });
}

function fixtureWrites({
  databaseRoot,
  documentPath,
  publicationId,
  packageId,
  workId,
  title,
  scope,
  studentId,
  publishedAt,
}) {
  const pkg = makePackage({
    packageId,
    workId,
    title,
    scope,
    studentId,
    publishedAt,
  });
  const bytes = new TextEncoder().encode(JSON.stringify(pkg));
  const manifestName = `${databaseRoot}/documents/${documentPath}`;

  return Object.freeze([
    makeWrite(
      manifestName,
      makeManifestFields({
        publicationId,
        packageId,
        title,
        scope,
        studentId,
        publishedAt,
        byteLength: bytes.byteLength,
      }),
    ),
    makeWrite(
      `${manifestName}/chunks/0`,
      Object.freeze({
        index: integerValue(0),
        data: bytesValue(bytes),
      }),
    ),
  ]);
}

export function buildStudent06SeedPlan({
  projectId,
  studentId,
  publishedAt,
}) {
  const safeProjectId = requireIdentifier(
    projectId,
    "projectId",
    PROJECT_ID_PATTERN,
  );
  const safeStudentId = requireIdentifier(
    studentId,
    "studentId",
    STUDENT_ID_PATTERN,
  );
  const safePublishedAt = requirePublishedAt(publishedAt);

  const databaseRoot =
    `projects/${safeProjectId}/databases/(default)`;

  const publicWrites = fixtureWrites({
    databaseRoot,
    documentPath:
      `publicPublications/${PUBLICATION_IDS.PUBLIC}`,
    publicationId: PUBLICATION_IDS.PUBLIC,
    packageId: PACKAGE_IDS.PUBLIC,
    workId: "work-test-public",
    title: "Test Havuz Çalışması",
    scope: "public_pool",
    studentId: safeStudentId,
    publishedAt: safePublishedAt,
  });

  const privateWrites = fixtureWrites({
    databaseRoot,
    documentPath:
      `students/${safeStudentId}/publications/${PUBLICATION_IDS.PRIVATE}`,
    publicationId: PUBLICATION_IDS.PRIVATE,
    packageId: PACKAGE_IDS.PRIVATE,
    workId: "work-test-private",
    title: "Test Kişisel Çalışma",
    scope: "student_private",
    studentId: safeStudentId,
    publishedAt: safePublishedAt,
  });

  return Object.freeze({
    projectId: safeProjectId,
    studentId: safeStudentId,
    publishedAt: safePublishedAt,
    writes: Object.freeze([...publicWrites, ...privateWrites]),
  });
}


function requireSeedPlan(plan) {
  if (
    plan === null ||
    typeof plan !== "object" ||
    !PROJECT_ID_PATTERN.test(plan.projectId ?? "") ||
    !Array.isArray(plan.writes) ||
    plan.writes.length === 0
  ) {
    throw new TypeError("seed plan is invalid");
  }

  return plan;
}

export async function commitStudent06SeedPlan({
  plan,
  accessToken,
  fetchImpl = globalThis.fetch,
}) {
  const safePlan = requireSeedPlan(plan);

  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length === 0
  ) {
    throw new TypeError("access token is required");
  }

  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetch implementation is required");
  }

  const url =
    `https://firestore.googleapis.com/v1/projects/${safePlan.projectId}/databases/(default)/documents:commit`;

  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes: safePlan.writes }),
    });
  } catch {
    throw new Error("Firestore seed commit request failed");
  }

  if (response?.ok !== true) {
    const status =
      Number.isInteger(response?.status) ? response.status : "unknown";
    throw new Error(`Firestore seed commit failed (${status})`);
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (
    Array.isArray(payload?.writeResults) &&
    payload.writeResults.length !== safePlan.writes.length
  ) {
    throw new Error("Firestore seed commit result count mismatch");
  }

  return Object.freeze({
    committedWrites: safePlan.writes.length,
  });
}
