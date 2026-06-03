// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      // Stub: @better-auth/kysely-adapter ships a Bun SQLite dialect that imports
      // DEFAULT_MIGRATION_TABLE which was removed from kysely 0.29. We use the
      // drizzle adapter, so redirect the entire package to a no-op stub.
      "@better-auth/kysely-adapter": path.resolve("stubs/kysely-adapter-stub.ts"),
    },
  },
});
