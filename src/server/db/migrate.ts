import { existsSync } from "node:fs";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { log } from "@/server/log";
import { createDb } from "./client";

const migrationsFolder = "drizzle";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const handle = createDb();
  try {
    if (handle.kind === "postgres") {
      await migratePg(handle.db as unknown as NodePgDatabase, { migrationsFolder });
    } else {
      await migratePglite(handle.db as unknown as PgliteDatabase, { migrationsFolder });
    }
    log.info("migrations applied", { driver: handle.kind });
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  log.error("migration failed", err);
  process.exit(1);
});
