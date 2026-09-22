#!/usr/bin/env node

import {
  buildStudent06SeedPlan,
  commitStudent06SeedPlan,
} from "./student06SeedFixture.js";

function readOption(args, name) {
  const index = args.indexOf(name);

  if (index === -1) {
    return null;
  }

  const value = args[index + 1];

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("--")
  ) {
    throw new TypeError(`${name} requires a value`);
  }

  return value;
}

function documentPath(write) {
  return write.update.name.split("/documents/").at(-1);
}

async function main() {
  const args = process.argv.slice(2);
  const projectId = readOption(args, "--project");
  const studentId = readOption(args, "--student");
  const publishedAt =
    readOption(args, "--published-at") ??
    new Date().toISOString();
  const apply = args.includes("--apply");

  if (projectId === null) {
    throw new TypeError("--project is required");
  }

  if (studentId === null) {
    throw new TypeError("--student is required");
  }

  const plan = buildStudent06SeedPlan({
    projectId,
    studentId,
    publishedAt,
  });

  if (!apply) {
    process.stdout.write(
      [
        `DRY RUN: ${plan.writes.length} bounded writes`,
        ...plan.writes.map((write) => `- ${documentPath(write)}`),
        "No Firestore data was changed.",
        "",
      ].join("\n"),
    );
    return;
  }

  const accessToken = process.env.FIRESTORE_ACCESS_TOKEN ?? "";

  if (accessToken.trim().length === 0) {
    throw new TypeError(
      "FIRESTORE_ACCESS_TOKEN is required for --apply",
    );
  }

  const result = await commitStudent06SeedPlan({
    plan,
    accessToken,
  });

  process.stdout.write(
    `COMMITTED: ${result.committedWrites} bounded writes\n`,
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "unknown seed failure";
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exitCode = 1;
});
