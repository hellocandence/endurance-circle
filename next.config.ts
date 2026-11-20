import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/server/http/security-headers";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // A new revision on every build so the offline page is refreshed with each deploy.
  additionalPrecacheEntries: [{ url: "/offline", revision: `${Date.now()}` }],
  disable: process.env.NODE_ENV === "development", // dev uses Turbopack and HMR; the worker is for production builds
});

const nextConfig: NextConfig = {
  // Native/WASM database drivers must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "pg", "sharp", "argon2"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: staticSecurityHeaders },
      // The service worker must always be re-checked so a deploy reaches users promptly.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default withSerwist(nextConfig);
