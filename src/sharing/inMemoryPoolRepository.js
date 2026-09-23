import { createPoolItem } from "../contracts/poolItem.js";

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function createInMemoryPoolRepository(initialItems = []) {
  if (!Array.isArray(initialItems)) {
    throw new TypeError("initial PoolItem collection must be an array");
  }

  const items = new Map();

  for (const source of initialItems) {
    const item = createPoolItem(source);

    if (items.has(item.poolItemId)) {
      throw new Error("poolItemId already exists");
    }

    items.set(item.poolItemId, item);
  }

  return Object.freeze({
    list() {
      return Object.freeze([...items.values()]);
    },

    getById(poolItemId) {
      if (!hasText(poolItemId)) {
        throw new TypeError("poolItemId must be a non-empty string");
      }

      return items.get(poolItemId.trim()) ?? null;
    },
  });
}
