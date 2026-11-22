import { existsSync } from "node:fs";
import { perMember, resetChallengeData } from "@/server/admin/reset-challenge";
import { createDb } from "@/server/db/client";

// One-off: remove every member's challenge data (programmes + daily logs). Users, sign-in data, profiles and body limits stay.
// pnpm challenge:reset           -> dry run (report only)
// pnpm challenge:reset --apply   -> delete (take a backup first)
async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const apply = process.argv.includes("--apply");
  const handle = createDb();
  try {
    console.log(`driver: ${handle.kind}`);
    console.table(await perMember(handle.db));
    const report = await resetChallengeData(handle.db, { apply });
    console.log(JSON.stringify(report, null, 2));
    console.log(apply ? "APPLIED: challenge data removed." : "DRY RUN: nothing was changed. Re-run with --apply to delete.");
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error("reset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
