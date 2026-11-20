// Structured JSON logging with redaction (docs/03 §5). Nothing sensitive may reach the logs, so every
// field goes through `redact`, and errors go through `safeError` (ORM errors embed the failed SQL with its
// parameters, which can contain hashes, weights or emails).

/** Keys whose values are never logged. Matched anywhere in the key, case-insensitive. */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|session|weight|height|limit|photo|bytes|hash|private|notes?|email|embedding|api[-_]?key|credential/i;

const REDACTED = "[redacted]";
const MAX_STRING = 500;

/** Credentials inside connection strings and bearer tokens inside free text. */
function scrubString(s: string): string {
  return s
    .replace(/(\w+:\/\/)[^/\s:@]+:[^@\s]+@/g, `$1${REDACTED}@`)
    .replace(/\bBearer\s+[\w.~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .slice(0, MAX_STRING);
}

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(typeof value); // functions, symbols
  if (value instanceof Error) return safeError(value);
  if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]`;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[circular]";
  if (depth > 6) return "[too deep]";
  seen.add(value);

  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1, seen)]),
  );
}

/** Name, a scrubbed short message, and the Postgres error code. Never the stack and never SQL parameters. */
export function safeError(err: unknown): { name: string; message: string; code?: string } {
  if (!(err instanceof Error)) return { name: "NonError", message: "unknown error" };
  const code = (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
  const failedQuery = /Failed query|params:/i.test(err.message);
  return {
    name: err.name,
    message: failedQuery ? "database query failed" : scrubString(err.message.split("\n")[0]),
    ...(typeof code === "string" ? { code } : {}),
  };
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, fields?: unknown) {
  const base = { level, time: new Date().toISOString(), msg: scrubString(msg) };
  const extra = fields instanceof Error ? { error: safeError(fields) } : (redact(fields ?? {}) as Record<string, unknown>);
  const line = JSON.stringify({ ...extra, ...base }); // base wins, so a field can never overwrite level/msg
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const log = {
  debug: (msg: string, fields?: unknown) => process.env.NODE_ENV !== "production" && write("debug", msg, fields),
  info: (msg: string, fields?: unknown) => write("info", msg, fields),
  warn: (msg: string, fields?: unknown) => write("warn", msg, fields),
  error: (msg: string, fields?: unknown) => write("error", msg, fields),
};
