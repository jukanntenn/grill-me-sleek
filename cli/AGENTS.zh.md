# AGENTS.md — cli/

[English](AGENTS.md) | 中文

仅对 CLI 树生效的命令；仓库级规则在根 [`AGENTS.md`](../AGENTS.zh.md)，此处绝不重复。

## Commands

```
pnpm test    # vitest run
pnpm build   # esbuild (build:prod for publishing)
pnpm dev     # run from source via tsx
```

## Style & publishing

ESLint 9、Prettier 3、`tsc --noEmit`、`pnpm-lock.yaml` 新鲜度——由 `cli/prek.toml` 拥有。包以 `@grilling-sleek/cli` 发布到 npm（`prepublishOnly` 跑 `build:prod`）。CLI flag 与命令形状是公共 API：改动属于根文件里的"先问"边界。
