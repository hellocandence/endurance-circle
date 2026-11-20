import { existsSync } from "node:fs";
import { createDb } from "./client";
import { seed } from "./seed";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const handle = createDb();
  try {
    const res = await seed(handle.db, { ownerEmail: process.env.OWNER_EMAIL ?? "" });
    console.log(
      `seed ok (${handle.kind}): owner ${res.ownerId}, commitment ${res.createdCommitment ? "created" : "already present"}`,
    );
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
