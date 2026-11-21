import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, redact, safeError } from "@/server/log";

describe("redact", () => {
  it("never keeps password, weight, limits or photo values (the T080 list), at any depth", () => {
    const out = JSON.stringify(
      redact({
        password: "hunter2-secret", newPassword: "another-secret", passwordHash: "$argon2id$v=19$m=65536$abc",
        weight: 71.5, weightKg: 71.5, heightCm: 172, limits: { run: 5, water: 3 }, runTargetKm: 5, studyMinTarget: 75, proteinMultiplier: 1.2,
        photo: "BASE64PHOTO", bytes: new Uint8Array(4000), photoBytes: Buffer.from("raw"),
        nested: { deep: { Weight: 80, Password: "P@ss", list: [{ weight: 90 }, { ok: 1 }] } },
        body: { weightKg: 66, bio: "fine" },
      }),
    );
    for (const secret of ["hunter2-secret", "another-secret", "argon2id", "71.5", "172", "BASE64PHOTO", "P@ss", "66", "raw"]) expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
    expect(out).toContain('"bio":"fine"'); // harmless fields survive
  });

  it("redacts credentials, tokens, cookies, emails and private notes too", () => {
    const out = JSON.stringify(redact({ authorization: "Bearer abc.def", cookie: "authjs.session-token=zzz", sessionToken: "tok", token: "t", AUTH_SECRET: "s", apiKey: "k", email: "a@example.com", privateNotes: "my knee", note: "x" }));
    for (const secret of ["abc.def", "zzz", '"tok"', '"s"', '"k"', "a@example.com", "my knee"]) expect(out).not.toContain(secret);
  });

  it("scrubs credentials inside connection strings and bearer tokens in free text", () => {
    expect(redact("connect to postgres://cadence:s3cr3t@db.render.com/cadence failed")).toBe("connect to postgres://[redacted]@db.render.com/cadence failed");
    expect(redact("sent Authorization: Bearer abc123.def")).toBe("sent Authorization: Bearer [redacted]");
  });

  it("summarises binary data instead of dumping it, and survives cycles and depth", () => {
    expect(redact(new Uint8Array(300_000))).toBe("[binary 300000 bytes]");
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(JSON.stringify(redact(a))).toContain("[circular]");
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { n: deep };
    expect(JSON.stringify(redact(deep))).toContain("[too deep]");
  });

  it("truncates huge strings and arrays", () => {
    expect((redact("x".repeat(5000)) as string).length).toBe(500);
    expect((redact(Array.from({ length: 500 }, (_, i) => i)) as number[]).length).toBe(50);
  });
});

describe("safeError", () => {
  it("drops ORM 'Failed query' messages, which carry the SQL and its parameters", () => {
    const err = new Error('Failed query: insert into "users" ("email", "password_hash") values ($1, $2)\nparams: a@example.com,$argon2id$v=19$secret');
    const out = safeError(err);
    expect(out.message).toBe("database query failed");
    expect(JSON.stringify(out)).not.toMatch(/argon2|a@example|password_hash/);
  });

  it("keeps the Postgres error code (useful for debugging) from the error or its cause", () => {
    expect(safeError(Object.assign(new Error("duplicate"), { code: "23505" })).code).toBe("23505");
    expect(safeError(new Error("outer", { cause: { code: "23503" } })).code).toBe("23503");
  });

  it("never includes a stack, and scrubs connection strings", () => {
    const out = safeError(new Error("cannot reach postgres://u:pw@host/db\n    at stack line"));
    expect(JSON.stringify(out)).not.toMatch(/pw@|stack line/);
    expect(safeError("not an error")).toEqual({ name: "NonError", message: "unknown error" });
  });
});

describe("log", () => {
  let lines: string[];
  beforeEach(() => {
    lines = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => void lines.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void lines.push(l));
  });
  afterEach(() => vi.restoreAllMocks());

  it("writes one JSON object per line with level, time and message", () => {
    log.info("hello", { requestId: "r1" });
    const row = JSON.parse(lines[0]);
    expect(row).toMatchObject({ level: "info", msg: "hello", requestId: "r1" });
    expect(new Date(row.time).getTime()).not.toBeNaN();
  });

  it("redacts fields and error details end to end", () => {
    log.error("save failed", { password: "hunter2", weightKg: 70, photo: "BYTES" });
    log.error("db down", new Error('Failed query: select ... params: a@example.com,hash'));
    // The timestamp is not a log field we are checking (and its milliseconds can contain "70"), so leave it out.
    const all = lines.map((l) => { const row = JSON.parse(l); delete row.time; return JSON.stringify(row); }).join("\n");
    for (const secret of ["hunter2", "70", "BYTES", "a@example.com", "params:"]) expect(all).not.toContain(secret);
    expect(JSON.parse(lines[1]).error.message).toBe("database query failed");
  });

  it("a field cannot overwrite level or msg", () => {
    log.warn("real message", { level: "debug", msg: "spoofed" });
    expect(JSON.parse(lines[0])).toMatchObject({ level: "warn", msg: "real message" });
  });
});

describe("no raw console output in server code", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  // log.ts is the one place that may print; the dev-only mailer prints links on purpose and is refused in production.
  const allowed = ["src/server/log.ts", "src/server/email/index.ts"];

  it("every other file logs through the redacting logger", () => {
    const offenders = files("src").filter((f) => !allowed.includes(f) && /\bconsole\.(log|error|warn|info|debug)\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
