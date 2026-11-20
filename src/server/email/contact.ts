import { parseSender } from "./index";

/**
 * The address people can write to: simply the one the app sends from (EMAIL_FROM), so there is one place to
 * change it and no address is written into the code. Null when no sender is configured (local dev).
 */
export function contactEmail(env: Record<string, string | undefined> = process.env): string | null {
  if (!env.EMAIL_FROM) return null;
  const { email } = parseSender(env.EMAIL_FROM);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
