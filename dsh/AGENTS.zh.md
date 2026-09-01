# AGENTS.md — dsh/

[English](AGENTS.md) | 中文

仅对本 dsh 插件树生效的命令；仓库级规则在根 [`AGENTS.md`](../AGENTS.md)，此处从不重复。

## Commands

```
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint src/ tests/
pnpm build       # esbuild bundle → dist/index.js (build:prod for publishing)
```

## Style & boundaries

ESLint 9、Prettier 3、严格 `tsc`（noUncheckedIndexedAccess、
exactOptionalPropertyTypes）、`pnpm-lock.yaml` 新鲜度——由 `dsh/prek.toml`
所有。包以 `@grilling-sleek/dsh-tool-grill-user` 发布到 npm；全部
`@deepseek-ai/dsh-*` 包是对已发布 alpha 频道的钉版 peer。bundle 将所有
peer external（打包 cordis 会分裂其模块单例）。发版推送驱动、独立
`0.0.x` 版本线：bump `version`、push 到 `main`，其余由
`.github/workflows/dsh-release.yml` 完成——门禁、发布、打 `dsh-v*` tag、
建 GitHub Release。工具参数 schema 与
`grill_user` id 文法是公开契约：修改它们属于根文件中的「先询问」边界。
此处不得追加自定义 `SessionEventMap` 事件：Harness 的读取路径会拒绝其
生成目录之外的事件类型，而只有仓库内包能进入该目录。
