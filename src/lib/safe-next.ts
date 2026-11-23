const BASE = "http://endurance-circle.invalid";

/**
 * Only same-site relative paths may be used as a post-login destination (no open redirects).
 * Control characters are rejected outright: browsers silently strip tab/CR/LF inside URLs, so
 * "/\t/evil.com" would otherwise turn into "//evil.com". The value must also parse to our own origin.
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\x00-\x1f\x7f\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
