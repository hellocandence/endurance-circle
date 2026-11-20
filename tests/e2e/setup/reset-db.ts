// Empties a REAL Postgres database so the e2e run starts clean (used when E2E_DATABASE_URL is set).
// Safety: it refuses any database whose name does not say e2e or test, so it can never wipe real data.
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/(e2e|test)/i.test(dbName)) throw new Error(`refusing to reset "${dbName}": the database name must contain "e2e" or "test"`);

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    console.log(`reset database ${dbName}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
