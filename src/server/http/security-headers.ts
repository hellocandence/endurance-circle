// Security headers (docs/03 §5): CSP, HSTS, X-Content-Type-Options, Referrer-Policy, and friends.

/**
 * Content-Security-Policy for pages. Scripts run only if they come from this origin or carry this request's
 * nonce, so an injected inline <script>, an inline event handler, a javascript: URL or a script from another
 * origin cannot run. ('strict-dynamic' is deliberately not used: it would let any script element created by
 * script load from anywhere, and this app only ever loads its own same-origin chunks.) Inline styles are allowed
 * because Tailwind and Framer Motion set style attributes. Google is allowed only as a form/redirect target
 * for OAuth sign-in (docs/03 §5: "self + Google OAuth").
 */
export function buildCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  const dev = opts.dev ?? process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}`, // React dev tooling needs eval; production never does
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:", // blob: is the photo crop preview
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`, // dev: hot-reload websocket
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ];
  if (!dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Headers that do not depend on the request, applied to every response by next.config. */
export const staticSecurityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" }, // older browsers; CSP frame-ancestors covers the rest
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** A fresh, unguessable nonce per request. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
