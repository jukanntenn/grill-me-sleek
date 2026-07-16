import { build } from "esbuild";

// ---------------------------------------------------------------------------
// Production-optimized esbuild configuration for Node.js CLI
//
// References:
// - https://esbuild.github.io/api/#minify
// - https://esbuild.github.io/api/#drop
// - https://esbuild.github.io/api/#tree-shaking
// ---------------------------------------------------------------------------

const isProduction = process.env.NODE_ENV === "production";

await build({
  entryPoints: ["src/grilling-sleek.ts"],
  bundle: true,
  outfile: "dist/grilling-sleek.js",
  platform: "node",
  target: "node22",
  format: "cjs",
  
  // Banner: shebang for CLI executable
  banner: {
    js: "#!/usr/bin/env node",
  },
  
  // JSON loader (inline schemas)
  loader: { ".json": "json" },
  
  // No external dependencies (fully self-contained)
  external: [],
  
  // -----------------------------------------------------------------------
  // Production optimizations
  // -----------------------------------------------------------------------
  
  // Minification (production only)
  minify: isProduction,
  // Fine-grained control (uncomment if needed):
  // minifyWhitespace: isProduction,
  // minifyIdentifiers: isProduction,
  // minifySyntax: isProduction,
  
  // Tree shaking (remove unused code)
  treeShaking: true,
  
  // Remove console/debugger in production (CLI uses process.stdout/stderr)
  drop: isProduction ? ["console", "debugger"] : [],
  
  // Remove dead code labels
  dropLabels: isProduction ? ["DEV", "PROD_REMOVE"] : [],
  
  // Mark pure functions for better tree shaking
  pure: isProduction ? ["console.log", "console.debug", "console.info", "console.warn"] : [],
  
  // Remove legal comments (license comments)
  legalComments: "none",
  
  // Source map (disable in production for smaller bundle)
  sourcemap: false,
  
  // Charset
  charset: "utf8",
  
  // -----------------------------------------------------------------------
  // Development options
  // -----------------------------------------------------------------------
  
  // Keep names for debugging (development only)
  keepNames: !isProduction,
});

console.log(`✅ Build complete (${isProduction ? "production" : "development"})`);
