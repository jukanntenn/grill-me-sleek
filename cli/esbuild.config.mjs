import { build } from "esbuild";

// Bundle the CLI into a single zero-dependency file with a node shebang.
// DESIGN.md §2162 — output is dist/grill.js. esbuild natively inlines the
// JSON schema import (single source of truth with the server).
await build({
  entryPoints: ["src/grill.ts"],
  bundle: true,
  outfile: "dist/grill.js",
  platform: "node",
  target: "node22",
  format: "cjs",
  banner: {
    js: "#!/usr/bin/env node",
  },
  minify: false,
  sourcemap: false,
  external: [],
  loader: { ".json": "json" },
});
