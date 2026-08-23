# AGENTS.md — cli/

English | [中文](AGENTS.zh.md)

Orders for the CLI tree only; the root [`AGENTS.md`](../AGENTS.md) carries the repo-wide rules and is never repeated here.

## Commands

```
pnpm test    # vitest run
pnpm build   # esbuild (build:prod for publishing)
pnpm dev     # run from source via tsx
```

## Style & publishing

ESLint 9, Prettier 3, `tsc --noEmit`, `pnpm-lock.yaml` freshness — owned by `cli/prek.toml`. The package publishes to npm as `@grilling-sleek/cli` (`prepublishOnly` runs `build:prod`). CLI flags and command shapes are a public API: changing them is an ask-first boundary in the root file.
