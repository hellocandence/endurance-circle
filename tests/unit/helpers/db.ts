import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";

/** Fresh in-memory Postgres (PGlite) with every migration applied. */
export async function makeTestDb() {
  const pg = new PGlite({ extensions: { vector } });
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { pg, db, close: () => pg.close() };
}
