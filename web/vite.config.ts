import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    cssCodeSplit: false, // single page, merge CSS into one file
    modulePreload: false, // no dynamic imports
    target: "es2022",
  },
  server: {
    proxy: {
      "/v1": "http://127.0.0.1:8080", // dev API proxy to Rust
    },
  },
});
