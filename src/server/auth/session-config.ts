export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, rolling (PRD F-01)
export const SESSION_UPDATE_AGE = 24 * 60 * 60; // push expiry forward at most once a day

/** Auth.js cookie name: the __Secure- prefix is used whenever the public URL is https. */
export function sessionCookie(env: { AUTH_URL?: string; NODE_ENV?: string } = process.env) {
  const secure = env.AUTH_URL ? env.AUTH_URL.startsWith("https://") : env.NODE_ENV === "production";
  return { name: `${secure ? "__Secure-" : ""}authjs.session-token`, secure };
}
