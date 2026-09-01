# AGENTS.md — dsh/

English | [中文](AGENTS.zh.md)

Orders for the dsh plugin tree only; the root [`AGENTS.md`](../AGENTS.md)
carries the repo-wide rules and is never repeated here.

## Commands

```
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint src/ tests/
pnpm build       # esbuild bundle → dist/index.js (build:prod for publishing)
```

## Style & boundaries

ESLint 9, Prettier 3, strict `tsc` (noUncheckedIndexedAccess,
exactOptionalPropertyTypes), `pnpm-lock.yaml` freshness — owned by
`dsh/prek.toml`. The package publishes to npm as
`@grilling-sleek/dsh-tool-grill-user`; all `@deepseek-ai/dsh-*` packages are
pinned peers against the published alpha channel. The bundle externals every
peer (bundling cordis would fork its module singleton). Releases are
push-driven on an independent `0.0.x` line: bump `version`, push to `main`,
and `.github/workflows/dsh-release.yml` gates, publishes, tags `dsh-v*`,
and opens the GitHub Release. The tool's parameter
schema and `grill_user` id grammar are a public contract: changing them is an
ask-first boundary in the root file. No custom `SessionEventMap` events may
be appended here: the Harness read path refuses event types outside its
generated catalog, which only in-repo packages can enter.
