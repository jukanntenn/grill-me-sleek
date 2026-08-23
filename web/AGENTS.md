# AGENTS.md — web/

English | [中文](AGENTS.zh.md)

Orders for the React SPA tree only; the root [`AGENTS.md`](../AGENTS.md) carries the repo-wide rules and is never repeated here.

## Commands

```
pnpm test    # vitest run
pnpm build   # tsc && vite build
pnpm dev     # dev server on :5173, proxying to the Hub on :8000
```

## Style

Prettier 3 (root config; `web/.prettierrc.json` adds the tailwind class-sort plugin), ESLint 9 flat config, `tsc --noEmit`, and `pnpm-lock.yaml` freshness — all owned by `web/prek.toml`; there is no second definition. The server defines the REST/SSE contract; `web/` consumes it and keeps no copy of its own.
