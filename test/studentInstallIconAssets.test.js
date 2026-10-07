import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const iconCases = [
  {
    path: "../src/assets/st-student-icon-192.png",
    width: 192,
    height: 192,
    sha256: "142462a5cc3136991d7639044406f47195a9456ed4723f3e06d7923d17ff3ae3",
  },
  {
    path: "../src/assets/st-student-icon-512.png",
    width: 512,
    height: 512,
    sha256: "5ebfecc13659dbee5af18f8e57bd3fab8a02321fcef234556f3a015a16ebf602",
  },
  {
    path: "../src/assets/st-student-apple-touch-icon.png",
    width: 180,
    height: 180,
    sha256: "067e93ffa771a42b067b0f637a9d0b6eb26ed4a04ce371a2183553ce319fc2df",
  },
];

test("ST Student install icons are the approved v2 PNG assets at exact platform sizes", async () => {
  for (const icon of iconCases) {
    const bytes = await readFile(new URL(icon.path, import.meta.url));

    assert.deepEqual(bytes.subarray(0, 8), PNG_SIGNATURE, icon.path);
    assert.equal(bytes.readUInt32BE(16), icon.width, icon.path);
    assert.equal(bytes.readUInt32BE(20), icon.height, icon.path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      icon.sha256,
      icon.path,
    );
  }
});
