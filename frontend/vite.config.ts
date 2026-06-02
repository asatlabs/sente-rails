// ─────────────────────────────────────────────────────────────────────────────
// Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
// Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>
//
// CONFIDENTIAL AND PROPRIETARY
//
// This source file is the original work of Geoffrey Oketwangwu and contains
// confidential, proprietary information protected under copyright and trade-
// secret law. No part may be reproduced, distributed, modified, reverse-
// engineered, or used — in source or compiled form — without the prior
// written permission of the author.
//
// All rights reserved.
// Vendor-neutral vite config for the workbench.
//
// Composes the underlying plugins directly (no wrapper config). Production
// build target is the Node SSR bundle that ships to /home/sente/workbench/
// on the dev server; that server runs no JS package manager, so the dist
// must be self-contained (ssr.noExternal: true).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      // SSR entry: src/server.ts wraps the SSR framework's request handler with
      // our error logger so 500s show up in the supervisor stderr log.
      server: { entry: "server" },
    }),
    viteReact(),
  ],

  resolve: {
    alias: {
      "@": srcDir,
    },
    // React must resolve to a single copy to avoid the
    // "Invalid hook call" + duplicate Provider tree class of bugs.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  build: {
    // Avoid /assets/ collision with the platform's own /assets/<app>/ tree.
    // Workbench-built JS/CSS/fonts go to /wb-assets/ on the served domain.
    assetsDir: "wb-assets",
  },

  ssr: {
    // Bundle every SSR dep into dist/server/ so `node serve.mjs` runs the
    // workbench with no node_modules at runtime. The deploy box has no JS
    // package manager installed; this is the explicit reason.
    noExternal: true,
  },

  server: {
    host: "::",
    port: 8080,
  },
});
