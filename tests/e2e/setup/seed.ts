// Seeds the isolated e2e database: an owner and two members, all verified, with a known password.
import { createDb } from "../../../src/server/db/client";
import { hashPassword } from "../../../src/server/auth/password";
import { bodyMetrics, commitments, profiles, users } from "../../../src/server/db/schema";
import { E2E_PASSWORD } from "./constants";

async function main() {
  const handle = createDb();
  try {
    const passwordHash = await hashPassword(E2E_PASSWORD);
    const rows = await handle.db
      .insert(users)
      .values([
        { email: "owner@e2e.test", name: "Olivia Owner", role: "OWNER", passwordHash, emailVerified: new Date() },
        { email: "alice@e2e.test", name: "Alice Member", passwordHash, emailVerified: new Date() },
        { email: "bob@e2e.test", name: "Bob Member", passwordHash, emailVerified: new Date() },
        { email: "fresh@e2e.test", name: "Fresh Member", passwordHash, emailVerified: new Date() }, // no programme yet
        { email: "todd@e2e.test", name: "Todd Today", passwordHash, emailVerified: new Date() }, // only the Today-screen tests write to him
        { email: "frank@e2e.test", name: "Frank Member", passwordHash, emailVerified: new Date() }, // password-change + sign-out-everywhere test only
        { email: "erin@e2e.test", name: "Erin Member", passwordHash, emailVerified: new Date() }, // password and session tests only
        // carol and dave are for tests that change things (profile, limits, photo, password, sessions)
        { email: "carol@e2e.test", name: "Carol Member", passwordHash, emailVerified: new Date() },
        { email: "dave@e2e.test", name: "Dave Member", passwordHash, emailVerified: new Date() },
      ])
      .returning({ id: users.id, email: users.email });
    const id = (email: string) => rows.find((r) => r.email === email)!.id;

    for (const r of rows) await handle.db.insert(profiles).values({ userId: r.id });
    await handle.db.insert(bodyMetrics).values([
      { userId: id("owner@e2e.test"), weightKg: "80" },
      { userId: id("alice@e2e.test"), weightKg: "70" }, // protein target 84 g
      { userId: id("bob@e2e.test"), weightKg: "90" },
      { userId: id("fresh@e2e.test") },
      { userId: id("todd@e2e.test"), weightKg: "70" }, // protein target 84 g
      { userId: id("erin@e2e.test"), weightKg: "65" },
      { userId: id("frank@e2e.test"), weightKg: "72" },
      { userId: id("carol@e2e.test"), weightKg: "60" },
      { userId: id("dave@e2e.test"), weightKg: "75" },
    ]);
    await handle.db.insert(commitments).values(
      ["owner@e2e.test", "alice@e2e.test", "bob@e2e.test", "carol@e2e.test", "dave@e2e.test", "todd@e2e.test", "erin@e2e.test", "frank@e2e.test"].map((e) => ({ userId: id(e), startDate: "2026-11-01" })),
    );
    console.log("e2e seed ok");
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
