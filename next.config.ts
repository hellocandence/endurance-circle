import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM database drivers must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "pg"],
};

export default nextConfig;
