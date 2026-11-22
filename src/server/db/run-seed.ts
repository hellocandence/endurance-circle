import { existsSync } from "node:fs";
import { log } from "@/server/log";
import { createDb } from "./client";
import { seed } from "./seed";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const handle = createDb();
  try {
    const res = await seed(handle.db, { ownerEmail: process.env.OWNER_EMAIL ?? "" });
    log.info("seed ok", { driver: handle.kind, ownerId: res.ownerId});
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  log.error("seed failed", err);
  process.exit(1);
});
