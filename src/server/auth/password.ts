import argon2 from "argon2";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

// argon2id with the library defaults (m=64 MiB, t=3, p=4): NFR-01.
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false; // malformed hash
  }
}

let dummyHash: Promise<string> | undefined;
/** Burn the same CPU as a real check so unknown emails are not distinguishable by timing. */
export async function dummyVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword("endurance-circle-dummy-password");
  await verifyPassword(await dummyHash, password);
  return false;
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  return null;
}
