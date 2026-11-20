// Post-deploy smoke test: `pnpm smoke https://your-app.onrender.com`
// Optional: SMOKE_EMAIL and SMOKE_PASSWORD (a real account) also check that sign-in works over HTTPS.
// It only reads and signs in; it never writes data.
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: pnpm smoke https://your-app.onrender.com");
  process.exit(2);
}
const isHttps = base.startsWith("https://");
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const get = (path, init) => fetch(base + path, { redirect: "manual", ...init });

// 1. alive (a sleeping free instance can take a minute to wake)
let health;
for (let i = 0; i < 12; i++) {
  health = await get("/api/health").catch(() => null);
  if (health?.ok) break;
  await new Promise((r) => setTimeout(r, 5000));
}
check("health check answers ok (database reachable)", health?.status === 200 && (await health.json()).ok === true, `status ${health?.status}`);

// 2. pages and PWA files
const login = await get("/login");
check("login page loads", login.status === 200);
const manifest = await get("/manifest.webmanifest");
const m = manifest.ok ? await manifest.json() : {};
check("web manifest is installable", m.display === "standalone" && m.icons?.some((i) => i.sizes === "512x512"));
check("offline page exists", (await get("/offline")).status === 200);
check("service worker is served and revalidated", (await get("/sw.js")).headers.get("cache-control")?.includes("no-cache") === true);

// 3. security headers
const h = login.headers;
const csp = h.get("content-security-policy") ?? "";
check("CSP present, no unsafe-eval, nonce-based scripts", csp.includes("script-src 'self' 'nonce-") && !csp.includes("unsafe-eval"));
check("CSP forbids framing and plugins", csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"));
check("HSTS on https", !isHttps || /max-age=\d{7,}/.test(h.get("strict-transport-security") ?? ""));
check("X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff");
check("Referrer-Policy set", h.get("referrer-policy") === "strict-origin-when-cross-origin");
check("no X-Powered-By", h.get("x-powered-by") === null);

// 4. data routes are closed to strangers
for (const path of ["/api/me", "/api/dashboard/public", "/api/journey/me", "/api/body", "/api/tracker/today", "/api/admin/members", "/api/progress"]) {
  check(`401 without a session: ${path}`, (await get(path)).status === 401);
}
check("pages behind sign-in redirect to /login", (await get("/dashboard")).status === 307 || (await get("/dashboard")).headers.get("location")?.includes("/login"));

// 5. optional: sign in over the real connection
const { SMOKE_EMAIL: email, SMOKE_PASSWORD: password } = process.env;
if (email && password) {
  const res = await get("/api/login", { method: "POST", headers: { "content-type": "application/json", origin: new URL(base).origin }, body: JSON.stringify({ email, password }) });
  const cookie = res.headers.get("set-cookie") ?? "";
  check("sign-in works", res.status === 200, `status ${res.status}`);
  check("session cookie is HttpOnly, SameSite=Lax" + (isHttps ? ", Secure, __Secure- prefixed" : ""),
    /HttpOnly/i.test(cookie) && /SameSite=lax/i.test(cookie) && (!isHttps || (/Secure/i.test(cookie) && cookie.startsWith("__Secure-"))));
  if (res.status === 200) {
    const me = await get("/api/me", { headers: { cookie: cookie.split(";")[0] } });
    const body = me.ok ? await me.json() : {};
    check("session works and exposes no secrets", me.status === 200 && !("passwordHash" in body) && !("sessionToken" in body));
  }
} else {
  console.log("SKIP  sign-in check (set SMOKE_EMAIL and SMOKE_PASSWORD to include it)");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
