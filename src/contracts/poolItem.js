export const POOL_AUDIENCE_MODES = Object.freeze({
  ALL: "ALL",
  SELECTED: "SELECTED",
});

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

function requiredText(value, name) {
  if (!hasText(value)) {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function optionalRevokedAt(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return requiredText(value, "revokedAt");
}

function normalizeRecipients(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(
      "recipientStudentIds must be a non-empty array for SELECTED",
    );
  }

  const recipients = [];

  for (const candidate of value) {
    const studentId = requiredText(candidate, "recipientStudentIds entry");

    if (!recipients.includes(studentId)) {
      recipients.push(studentId);
    }
  }

  if (recipients.length === 0) {
    throw new TypeError(
      "recipientStudentIds must be a non-empty array for SELECTED",
    );
  }

  return Object.freeze(recipients);
}

export function createPoolItem(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("PoolItem must be an object");
  }

  const audienceMode = value.audienceMode;

  if (!Object.values(POOL_AUDIENCE_MODES).includes(audienceMode)) {
    throw new TypeError("audienceMode must be ALL or SELECTED");
  }

  const item = {
    poolItemId: requiredText(value.poolItemId, "poolItemId"),
    title: requiredText(value.title, "title"),
    shortDescription:
      typeof value.shortDescription === "string"
        ? value.shortDescription
        : (() => {
            throw new TypeError("shortDescription must be a string");
          })(),
    detailText:
      typeof value.detailText === "string"
        ? value.detailText
        : (() => {
            throw new TypeError("detailText must be a string");
          })(),
    publishedAt: requiredText(value.publishedAt, "publishedAt"),
    audienceMode,
    revokedAt: optionalRevokedAt(value.revokedAt),
  };

  if (audienceMode === POOL_AUDIENCE_MODES.ALL) {
    if ("recipientStudentIds" in value) {
      throw new TypeError(
        "recipientStudentIds is not allowed when audienceMode is ALL",
      );
    }
  } else {
    item.recipientStudentIds = normalizeRecipients(
      value.recipientStudentIds,
    );
  }

  return Object.freeze(item);
}

export function canStudentReadPoolItem(item, studentId) {
  const normalized = createPoolItem(item);
  const stableStudentId = requiredText(studentId, "studentId");

  if (normalized.revokedAt !== null) {
    return false;
  }

  if (normalized.audienceMode === POOL_AUDIENCE_MODES.ALL) {
    return true;
  }

  return normalized.recipientStudentIds.includes(stableStudentId);
}

export function toStudentPoolItem(item) {
  const normalized = createPoolItem(item);

  return Object.freeze({
    poolItemId: normalized.poolItemId,
    title: normalized.title,
    shortDescription: normalized.shortDescription,
    detailText: normalized.detailText,
    publishedAt: normalized.publishedAt,
    audienceMode: normalized.audienceMode,
  });
}
