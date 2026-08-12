// Vite config for the web UI. `@core` aliases to the compiler core's
// src/ (see web/tsconfig.json's matching `paths` entry, which is what
// makes the alias visible to the TypeScript language service too — Vite
// only handles the runtime/bundling side) so web/src/engine can import
// src/index.ts's compile() and src/runtime/browser/browser-runtime.ts's
// BrowserRuntime without a package publish step. See CLAUDE.md's UI
// replaceability contract.

import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
});
