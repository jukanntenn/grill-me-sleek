# AGENTS.md — web/

[English](AGENTS.md) | 中文

仅对 React SPA 树生效的命令；仓库级规则在根 [`AGENTS.md`](../AGENTS.zh.md)，此处绝不重复。

## Commands

```
pnpm test    # vitest run
pnpm build   # tsc && vite build
pnpm dev     # dev server on :5173, proxying to the Hub on :8000
```

## Style

Prettier 3（根配置；`web/.prettierrc.json` 增加 tailwind class-sort 插件）、ESLint 9 flat config、`tsc --noEmit`、`pnpm-lock.yaml` 新鲜度——全部由 `web/prek.toml` 拥有；不存在第二份定义。REST/SSE 契约由 server 定义；`web/` 只消费，不自己留副本。
