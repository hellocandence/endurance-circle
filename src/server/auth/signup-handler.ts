import type { Db } from "@/server/db/client";
import type { Mailer } from "@/server/email";
import { notifyAlreadyRegistered } from "./account";
import { signUpWithInvite } from "./invites";

export type SignUpInput = { token: string; email: string; password: string; name: string; now?: Date };

/**
 * Same answer whether or not the email already has an account (no enumeration by invite holders):
 * a taken email gets a "you already have an account" notice instead, and the invite is not consumed.
 * `mailer` should defer sending until after the response so timing is uniform too.
 */
export async function handleSignUp(db: Db, mailer: Mailer, input: SignUpInput): Promise<{ status: number; body: Record<string, unknown> }> {
  const result = await signUpWithInvite(db, mailer, input);
  if (result.ok) return { status: 201, body: { ok: true } };
  if (result.reason === "email_taken") {
    await notifyAlreadyRegistered(mailer, input.email);
    return { status: 201, body: { ok: true } };
  }
  return { status: 400, body: { error: result.reason, message: result.message } };
}
