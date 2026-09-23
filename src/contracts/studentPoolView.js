const ALLOWED_KEYS = Object.freeze([
  "poolItemId",
  "title",
  "shortDescription",
  "detailText",
  "publishedAt",
  "audienceMode",
]);

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requiredString(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  return value;
}

export function createStudentPoolView(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("StudentPoolView must be an object");
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.includes(key)) {
      throw new TypeError(`unsupported StudentPoolView field: ${key}`);
    }
  }

  if (!["ALL", "SELECTED"].includes(value.audienceMode)) {
    throw new TypeError("audienceMode must be ALL or SELECTED");
  }

  return Object.freeze({
    poolItemId: requiredText(value.poolItemId, "poolItemId"),
    title: requiredText(value.title, "title"),
    shortDescription: requiredString(
      value.shortDescription,
      "shortDescription",
    ),
    detailText: requiredString(value.detailText, "detailText"),
    publishedAt: requiredText(value.publishedAt, "publishedAt"),
    audienceMode: value.audienceMode,
  });
}
