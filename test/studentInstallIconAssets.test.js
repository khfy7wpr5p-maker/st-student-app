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
    sha256: "a3a6f9d953395945f4ea48ba7ccd73417a2218ec2053d94c66a78aa84ae3d2bf",
  },
  {
    path: "../src/assets/st-student-icon-512.png",
    width: 512,
    height: 512,
    sha256: "12d95b8bbdc7e2dadeac9808a79407b03bcd1efff7ea4b9fec3b63ee329ec5b6",
  },
  {
    path: "../src/assets/st-student-apple-touch-icon.png",
    width: 180,
    height: 180,
    sha256: "f1beec500ff613a309e1bba93ae59d7a1b963dbf531f2999932bbe336ed62b41",
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
