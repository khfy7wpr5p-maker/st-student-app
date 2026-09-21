import { assertPublishablePracticePackage } from "../../sharing/packageEligibility.js";

export const FIRESTORE_PACKAGE_REPRESENTATION_VERSION = "1";
export const MAX_FIRESTORE_CHUNK_BYTES = 256 * 1024;

function isRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function chunkBytes(data) {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (typeof data?.toUint8Array === "function") {
    const value = data.toUint8Array();

    if (value instanceof Uint8Array) {
      return value;
    }
  }

  throw new TypeError("Firestore package chunk must contain bytes");
}

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export function decodeFirestorePackage({ manifest, chunks }) {
  if (!isRecord(manifest)) {
    throw new TypeError("Firestore package manifest must be an object");
  }

  if (
    manifest.representationVersion !==
    FIRESTORE_PACKAGE_REPRESENTATION_VERSION
  ) {
    throw new TypeError("unsupported Firestore package representation");
  }

  if (manifest.encoding !== "utf-8-json") {
    throw new TypeError("unsupported Firestore package encoding");
  }

  requirePositiveInteger(manifest.chunkCount, "chunkCount");
  requirePositiveInteger(manifest.totalBytes, "totalBytes");

  if (!Array.isArray(chunks)) {
    throw new TypeError("Firestore package chunks must be an array");
  }

  if (chunks.length !== manifest.chunkCount) {
    throw new Error("Firestore package chunk count mismatch");
  }

  const normalized = new Array(manifest.chunkCount);
  let actualBytes = 0;

  for (const chunk of chunks) {
    if (!isRecord(chunk) || !Number.isInteger(chunk.index)) {
      throw new TypeError("Firestore package chunk index is invalid");
    }

    if (
      chunk.index < 0 ||
      chunk.index >= manifest.chunkCount ||
      normalized[chunk.index] !== undefined
    ) {
      throw new Error("Firestore package chunk index is invalid");
    }

    const bytes = chunkBytes(chunk.data);

    if (bytes.byteLength > MAX_FIRESTORE_CHUNK_BYTES) {
      throw new Error("Firestore package chunk exceeds byte limit");
    }

    normalized[chunk.index] = bytes;
    actualBytes += bytes.byteLength;
  }

  if (normalized.some((bytes) => bytes === undefined)) {
    throw new Error("Firestore package chunk sequence is incomplete");
  }

  if (actualBytes !== manifest.totalBytes) {
    throw new Error("Firestore package byte length mismatch");
  }

  const combined = new Uint8Array(actualBytes);
  let offset = 0;

  for (const bytes of normalized) {
    combined.set(bytes, offset);
    offset += bytes.byteLength;
  }

  let decoded;

  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(combined);
  } catch {
    throw new Error("Firestore package UTF-8 decoding failed");
  }

  let pkg;

  try {
    pkg = JSON.parse(decoded);
  } catch {
    throw new Error("Firestore package JSON is invalid");
  }

  assertPublishablePracticePackage(pkg);
  return deepFreeze(pkg);
}
