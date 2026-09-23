function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createPracticeAccessRef(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.kind === "PUBLICATION"
  ) {
    return Object.freeze({
      kind: "PUBLICATION",
      publicationId: requiredText(
        value.publicationId,
        "publicationId",
      ),
    });
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.kind === "SECURE_DELIVERY"
  ) {
    return Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: requiredText(
        value.deliveryId,
        "deliveryId",
      ),
    });
  }

  throw new TypeError("unsupported PracticeAccessRef");
}

export function practiceAccessKey(value) {
  const ref = createPracticeAccessRef(value);

  return ref.kind === "PUBLICATION"
    ? `PUBLICATION:${ref.publicationId}`
    : `SECURE_DELIVERY:${ref.deliveryId}`;
}
