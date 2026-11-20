export const SESSION_MAX_AGE = 90 * 24 * 60 * 60; // 90 days of inactivity, rolling: the middleware re-issues the cookie on every visit, so installed apps stay signed in (PRD F-01 said 30)
export const SESSION_UPDATE_AGE = 24 * 60 * 60; // push expiry forward at most once a day

/** Auth.js cookie name: the __Secure- prefix is used whenever the public URL is https. */
export function sessionCookie(env: { AUTH_URL?: string; NODE_ENV?: string } = process.env) {
  const secure = env.AUTH_URL ? env.AUTH_URL.startsWith("https://") : env.NODE_ENV === "production";
  return { name: `${secure ? "__Secure-" : ""}authjs.session-token`, secure };
}
