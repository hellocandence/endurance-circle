// One-off: set the owner's password directly (when no reset email can be sent yet).
// Reads OWNER_EMAIL and OWNER_INITIAL_PASSWORD from .env.local. Prints nothing secret. Change the password in Settings afterwards.
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { createDb } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_INITIAL_PASSWORD ?? "";
  if (!email) throw new Error("OWNER_EMAIL is not set");
  const problem = passwordProblem(password);
  if (problem) throw new Error(`OWNER_INITIAL_PASSWORD: ${problem}`);

  const handle = createDb();
  try {
    const [owner] = await handle.db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
    if (!owner || owner.role !== "OWNER") throw new Error("No OWNER account with that email");
    await handle.db.update(users).set({ passwordHash: await hashPassword(password), emailVerified: new Date() }).where(eq(users.id, owner.id));
    await handle.db.delete(sessions).where(eq(sessions.userId, owner.id));
    console.log(`Owner password set for ${email} (${handle.kind}). Sign in at /login, then change it in Settings.`);
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
