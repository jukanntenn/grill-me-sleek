# AGENTS.md

[English](AGENTS.md) | 中文

> 本文件给 AI 编码 agent（Claude Code、Codex、ZCode、OpenCode 等）提供本仓库的运行规则。它刻意简短、具体、命令优先。`CLAUDE.md` 是方向无关的字节相同镜像（由 `scripts/sync_agents.py` 保持同步）。子树 `AGENTS.md`（`server/`、`web/`、`cli/`、`e2e/`、`specs/`）承载树内命令，绝不重复本文件。设计与行为原则见 [`PRINCIPLES.zh.md`](PRINCIPLES.zh.md)。

## 1. Project Overview

**grill-me-sleek** 在 vibe coding 之前对计划做压力测试：agent 提问，你在精致的 web UI 里作答。四个组件，一个仓库：

| 组件      | 路径       | 角色                                                                       |
| --------- | ---------- | -------------------------------------------------------------------------- |
| `server/` | Rust       | "Hub"——REST API + SSE，SQLite 存储（axum + sqlx）                          |
| `web/`    | TypeScript | 供用户审阅问题的 React SPA                                                 |
| `cli/`    | TypeScript | 发布到 npm 的 `@grilling-sleek/cli`；连接 agent 与 Hub                     |
| `dsh/`    | TypeScript | 发布到 npm 的 `@grilling-sleek/dsh-tool-grill-user`；DeepSeek Harness 插件 |

## 2. Tech Stack

Server：Rust edition 2024（MSRV 1.85）、axum 0.8、sqlx 0.9（sqlite、migrate、sqlite-bundled）、tokio 1。Web：React 19、Vite 8、TypeScript 5.9、Tailwind 4.3、ESLint 9、Vitest 3.2、Prettier 3。CLI：TypeScript 5.9、esbuild 0.25。E2E：Playwright 1.61。质量门控：**prek** 0.4+（workspace + groups）。包管理器：**pnpm 11**（各包独立 lockfile；无 workspace 根安装）。

## 3. Commands

**prek 是所有质量门控的唯一事实来源。** 每个 format/lint/check 都在 `prek.toml`（根）+ `server|web|cli|dsh/prek.toml` 里。CI 跑的是同一批钩子，因此本地绿 == CI 绿：

```
prek install                    # one-time: install git hooks
prek run --all-files            # everything (== CI gate)
prek run --group format --files <path>
python3 scripts/doc_sync.py     # documentation gates (staged files; none = all)
```

各树的命令（cargo、pnpm、playwright）住在该树的 `AGENTS.md`。仓库根工具：

```
python3 scripts/migrate.py prepare|check|add   # sqlx .sqlx cache (see §9)
python3 docker/build.py [--push]               # build/push the main image
ansible-playbook devops/ansible/deploy.yml [-e target=production]
```

## 4. Project Structure

```
prek.toml        Workspace-root prek config (builtin checks, prettier-root,
                 actionlint, agents-sync, doc-check, commit-msg).
server/          Rust service. WRITE HERE for API/DB work (own AGENTS.md).
web/             React SPA. WRITE HERE for UI work (own AGENTS.md).
cli/             CLI tool. WRITE HERE for CLI work (own AGENTS.md).
dsh/             DeepSeek Harness plugin (own AGENTS.md).
e2e/             Playwright E2E vs docker-compose.local (own AGENTS.md).
specs/           Design reference + the documentation standard (AGENTS.md)
                 with an authoritative index (index.md).
docs/            Operations runbooks (bilingual; e.g. Cloudflare deployment).
tests/load/      Load-test suite and operational reports (exempt from doc
                 pairing).
docker/          Dockerfile + compose configs + build.py (Caddy → :8000).
devops/ansible/  Unified deploy.yml + group_vars/{staging,production}.
scripts/         Repo tooling, Python stdlib only.
skills/          Packaged grilling-sleek skill source (release artifact).
.agents/gs-rfcs/ Decision records (see §6). .agents|zcode/skills/ mirrors.
.claude/ .codex/ .zcode/ .opencode/   Agent-tool config, not source (§10).
```

## 5. Code Style

**prek 定义每一次格式化/lint 调用**——CI 或其他任何地方都没有平行定义。生成物豁免修复器、改为按新鲜度校验：`server/.sqlx/`（server:sqlx-check）、`pnpm-lock.yaml`（\*:lockfile-fresh）、`Cargo.lock`（clippy `--locked`）。语言细节（rustfmt/clippy 配置、sqlx 宏、各包 eslint/prettier）住在子树 `AGENTS.md`。遵循周围代码的既有模式。

## 6. GS-RFCs

每个非平凡变更都在同一批里新增或更新一份 GS-RFC，位置在 [`.agents/gs-rfcs/`](.agents/gs-rfcs/README.zh.md)——先 grep 树找主题；只有机械/局部编辑豁免。GS-RFC 是双语决策记录（提案 → 评审 → 实施）；`writing-gs-rfcs` 技能拥有这套工作流。

## 7. Documentation

语料是双语的：每个未豁免文档都配一个等权的 `foo.zh.md`，一起更新。[`specs/AGENTS.md`](specs/AGENTS.zh.md) 拥有标准（one fact one home、现态行文、机器可查链接、词数预算）；`scripts/doc_sync.py` 在提交与 CI 时跑门控。门控失败修文档，而不是修门控。放置决策用 `doc-standards` 技能。

## 8. Git Workflow

- **不要在 agent 自主意志下提交或推送。** 工作完成且 lint 干净时停下，让用户评审并提交。
- Conventional Commits：`feat(server): ...`、`fix(web): ...`、`docs: ...`。`commit-msg` 钩子拒绝其他格式。
- 按项目约定直接落在 `main`。prek 安装 `pre-commit`（format+lint+check）、`pre-push`（tests+builds）、`commit-msg`。

## 9. Boundaries

**✅ 总是：** 触碰 `server/migrations/`、`server/src/db/` 或 `server/Cargo.toml` 后运行 `python3 scripts/migrate.py prepare`；让 prek 做格式化；保持 ESLint 与 clippy 干净（`-D warnings`）。

**⚠️ 先问：** 改公共 API 形状（请求/响应 JSON、CLI flag）；大规模多文件重构；新增依赖。

**🚫 绝不：** `git push` 或任何远端操作；手改生成文件（`server/.sqlx/`、lockfile）；改 `skills/` 与 `*/skills/grilling-sleek/` 下的打包技能；直接改 `CLAUDE.md` 或镜像技能（运行 `scripts/sync_agents.py`）；提交密钥或 `.env`；跑破坏性命令（`rm -rf`、`DROP TABLE`、force-push）。

## 10. Agent Configuration

`.claude/`、`.codex/`、`.zcode/`、`.opencode/`、`.agents/` 持有 agent 工具配置，非项目源码。它们的钩子是 prek 之上的薄适配器：PostToolUse 跑 `prek run --group format --files <edited>`，Stop 跑 `prek run --group lint --all-files`——其中没有任何格式化/lint 逻辑。`AGENTS.md` ⇄ `CLAUDE.md` 对是方向无关的字节相同镜像；镜像技能集合从 `.claude/skills/` 派生并排除打包的 `grilling-sleek` 技能。只有用户明确要求改变 agent 行为时才编辑这些。

## 11. Build & Deploy

端到端发布当前工作（门控 → 提交 → 构建推送 → 部署 → 报告）：用 `shipping` 技能。部署默认到 staging（LAN registry 的滚动 `main` tag）。版本 tag 由 CI 在 `v*` 时推到 Docker Hub；production 部署锁定的版本 tag，需要先发布（`release` 技能）。部署后健康检查将 `/v1/healthz` 的 `version` 与 `server/Cargo.toml` 比对。
