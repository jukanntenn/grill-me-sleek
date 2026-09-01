import { build } from "esbuild";

const production = process.env.NODE_ENV === "production";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/index.js",
  // Peers and runtime deps stay external: the host Harness process already
  // provides them, and bundling cordis would fork its module singleton.
  external: [
    "@deepseek-ai/cordis",
    "@deepseek-ai/schemastery",
    "@deepseek-ai/dsh-agent",
    "@deepseek-ai/dsh-brand",
    "@deepseek-ai/dsh-skill",
    "@deepseek-ai/dsh-timeout",
    "@deepseek-ai/dsh-tool-call-timeout-policy",
    "@deepseek-ai/dsh-tools",
    "@deepseek-ai/dsh-user-questions",
  ],
  minify: production,
});
