import { createRateLimiter, type RateLimiter } from "./rate-limit";

const MIN15 = 15 * 60 * 1000;

// One set of limiters per server process (survives dev hot reloads).
const g = globalThis as unknown as { __enduranceCircleLimits?: ReturnType<typeof build> };

function build() {
  const l = (limit: number): RateLimiter => createRateLimiter({ limit, windowMs: MIN15 });
  return {
    loginIpEmail: l(10), // arch §5: 10 attempts per 15 min per IP + email
    loginIp: l(60), // slows password spraying across many emails from one address
    loginEmail: l(30), // slows distributed guessing at one account, whatever the IP header says
    signupIp: l(10),
    inviteStartIp: l(20),
    emailIp: l(20), // forgot-password / resend-verification, per address
    emailIpEmail: l(5), // ... per address + target email (stops mail bombing a victim)
    emailEmail: l(10), // ... per target email across all addresses
    tokenIp: l(20), // verify-email / reset-password token guessing
    passwordUser: l(5), // wrong "current password" guesses while signed in, per member
    photoUser: l(10), // image processing is CPU heavy: 10 uploads per 15 min per member
  };
}

export const limits = (g.__enduranceCircleLimits ??= build());
