import { headers } from "next/headers";

/**
 * "Now" for a request. In development and tests only, the x-cadence-test-now header can set it (to test
 * Sundays, day 75, ...). The NODE_ENV check is inlined at build time, so this never exists in production.
 */
export async function requestNow(): Promise<Date> {
  if (process.env.NODE_ENV !== "production") {
    const raw = (await headers()).get("x-cadence-test-now");
    if (raw && !Number.isNaN(Date.parse(raw))) return new Date(raw);
  }
  return new Date();
}
