// Sends one message through Misa AI (the WhatsApp bot). Misa only delivers; the schedule lives here.
export type MisaMessage = { text: string; mentions: string[] };
type Env = Record<string, string | undefined>;

export class MisaError extends Error {}

export async function sendViaMisa(msg: MisaMessage, idempotencyKey: string, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const base = env.MISA_URL;
  const secret = env.MISA_SECRET;
  if (!base || !secret) throw new MisaError("Misa is not configured (MISA_URL, MISA_SECRET)");
  let res: Response;
  try {
    res = await fetchImpl(`${base.replace(/\/+$/, "")}/ec/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ ...msg, key: idempotencyKey }),
      signal: AbortSignal.timeout(45_000), // Misa may be waking from sleep
    });
  } catch (err) {
    throw new MisaError(`Misa unreachable: ${(err as Error).name}`);
  }
  if (!res.ok) throw new MisaError(`Misa answered ${res.status}`);
}
