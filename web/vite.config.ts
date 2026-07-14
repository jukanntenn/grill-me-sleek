import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: true,
  },
});
