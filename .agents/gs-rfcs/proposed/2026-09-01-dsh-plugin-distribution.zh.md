# GS-RFC: dsh 插件分发——npm 渠道、独立版本线、推送驱动发版

Status: proposed

[English](2026-09-01-dsh-plugin-distribution.md) | 中文

## Problem

[集成决策记录](../implemented/2026-08-31-dsh-grilling-integration.zh.md)所把关的 dsh 包还没有任何触达用户的路径。它未发布（npm 包名 404），而且以现有形态根本无法作为插件被安装：官方 `dsh plugin --profile <name> add <spec>` 协调器只挂载声明了 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 并随包附带该 patch 的包——没有此声明的包会带着一条一次性警告被装成普通依赖，永远进不了 bundle 栈（插件市场最常见的被拒原因正是这一点）。`dsh/package.json` 里的版本号 `0.1.0` 定于版本线达成共识之前；CI 完全没有 dsh 的位置（`ci.yml` 的 `prek validate-config` 覆盖四个 prek 配置，其中没有 `dsh/prek.toml`）；唯一可用的加载路径是指向 `dsh/src/index.ts` 的开发者 overlay。已定的节奏——`0.0.x` dogfooding、可能逐日发版——需要一个面向用户的安装命令，和一条本地全部仪式只有「bump 版本 + push」的发版路径。

## Proposal

以 npm 为唯一主渠道分发，插件走自己的版本线，push 到 main 即发版。四个决定：

1. **可安装物就是 npm 包，由它自带的 bundle patch 挂载。** `dsh/package.json` 增加 `dsh.bundle` 声明（patch `./cordis.patch.yml`）；patch 只插入一行——`id: tool-grill-user`、`name: '@grilling-sleek/dsh-tool-grill-user'`——与开发者 overlay 用同一个 id，本地挂载与安装挂载可互换。`files` 扩充为在构建产物旁携带 `cordis.patch.yml`、两份 README 和 `LICENSE`（从仓库根复制）。用户以 `dsh plugin --profile web add @grilling-sleek/dsh-tool-grill-user` 安装并重启 profile——仅此而已。本包是预构建的 esbuild 单文件 bundle、所有 peer 外置，安装零构建脚本：没有 `allowBuilds` 提示，不重蹈携带 node-pty 的插件首装必败的覆辙。git 与 tarball 安装仍然可行、文档定位为次级渠道——GitHub Release 附带 `pnpm pack` 的 tarball 资产——但 git 安装拉取的是源码，要求包自带 `prepare` 脚本，且用户得放行安装期代码执行。
2. **版本线是插件自己的；cli 与 server 不随它动。** dsh 从 `0.0.1` 起步（重置从未发布的 `0.1.0`），以 `0.0.x` 迭代并明示这是 dogfooding，功能集稳定后切 `0.1.0-rc.1`，经社区使用后落 `0.1.0`。cli 与 server 保持现有统一 `v*` 线及其发版机具不动——插件与它们的契约是 Hub 的 REST 面（跨 CLI 世代本就稳定），不是同一个数字。npm dist-tag 沿用仓库既有预发布规则：纯版本发 `latest`（dogfooding 期间不带 tag 的安装即得当前切），`-rc.*` 发 `next`，`0.1.0` 把 `latest` 交回稳定线。
3. **push 到 main 就是发版的全部仪式。** 新增 `.github/workflows/dsh-release.yml`，在每次 push 到 main 时运行：对比 `dsh/package.json` 的版本与 registry，发现新版本即跑 dsh 全套门禁（frozen-lockfile 安装、lint、typecheck、test、`build:prod`），pack，经现有 `NPM_TOKEN` 管线（即已发布 cli 的那条）带 provenance 发布，回推 tag `dsh-v<version>`，并创建附带 tarball 资产的 GitHub Release，notes 自上一个 `dsh-v*` tag 以来的 conventional commits 生成。版本已发布的 push 是 no-op。`0.0.x` 不写人工 changelog——提交流即 changelog；curated release notes 从 `0.1.0-rc.1` 开始，那时受众才从作者变成社区。`dsh-v*` 命名空间匹配不到 `release.yml`/`docker-publish.yml` 的 `v*` 触发器，工作流回推的 tag 不会再触发任何工作流。
4. **可发现性走官方入场通道。** 仓库即刻打上 `dsh-plugin` GitHub topic；`0.0.x` 线经过几轮发版稳定后，向 awesome-dsh-plugin 提交 monorepo 子包条目（`data/plugins/jukanntenn__grill-me-sleek--dsh.yml`、category `tools`、双语一句话描述）——dshmarket 与 dsh-find-plugin 自动从该数据列出。收录前提随本记录落地即满足（仓库年龄与提交数已达标；`dsh.bundle` 随决定 1 到位；npm 的 `repository` 字段本就指回本仓库）。

同一批次补齐 CI 的 dsh 平权：`prek validate-config` 列入 `dsh/prek.toml`，并增加按路径过滤的 dsh lane，跑与发版工作流相同的门禁。

## Alternatives considered

**git 仓库分发（`github:owner/repo` spec）。** 官方支持、不依赖 npm。败于安装摩擦：git 安装拉取源码，包必须自带 `prepare` 构建脚本，且每个用户都要在其 profile 的 `pnpm-workspace.yaml` 里放行——官方文档把这层放行定性为「允许该包在安装期于本机执行代码」。npm 一条命令就能拿到带 provenance 的同一份预构建产物。

**标签驱动发版（推 `dsh-v*` tag 触发发布）。** 与仓库现有 `v*` 线结构同构、最审慎。败于节奏：每次发版多一步本地操作，而 dogfooding 可能逐日发版；`dsh/package.json` 的版本字段本就承载发布意图，tag 只是把同一信息复述一遍，还引入了不一致的失败模式——DSH-better-sidebar 的工作流里那段校验正是为抓这种不一致而存在。

**GitHub Release 驱动发布。** DSH-better-sidebar 的实际触发方式（`on: release: published`）。败于仪式最重：每次发版都要一次网页手动操作，与 `0.0.x` 节奏背道而驰。

**并入仓库统一版本线。** cli、server、dsh 共用一个数字、一个发布事件。败于耦合：快速迭代的插件要么拖着 cli/server 空转 bump，要么等它们的慢节奏。插件与 Hub 的真实契约是 REST 面，不是版本号。

**npm Trusted Publishing（OIDC，无常驻 token）。** 密钥卫生严格更优，DSH-better-sidebar 已验证。推迟而非否决：它需要在 npmjs.com 上每个包一次的手工配置，而 `NPM_TOKEN` 管线在 cli 上已验证过 provenance。token 政策收紧时迁移。

**`dsh.plugin.json` + `dsh registry` 通道。** DSH-better-sidebar 的第二分发渠道（独立 manifest 的暂存 registry 根）。败于维护成本：多一个要保持新鲜的安装根，覆盖的安装路径 bundle patch 已然覆盖。

**dogfooding 走非 `latest` dist-tag（`dogfood`/`alpha`）。** 可以为 `0.1.0` 保住干净的 `latest`。败于摩擦：每次 dogfood 安装都要显式加 `@tag` 后缀，况且尚无稳定线时 `latest` 指向 `0.0.x` 本就是诚实状态。`-rc.*` → `next` 规则已能在稳定线出现后保护它。

## Acceptance criteria

- `dsh/package.json` 声明 bundle manifest 且版本为 `0.0.1`；在 `dsh/` 下 `pnpm pack` 得到的 tarball 含 `dist/index.js`、`cordis.patch.yml`、两份 README 与 `LICENSE`；patch 以包名插入 `tool-grill-user`。
- 该 tarball 经官方 CLI 安装（`dsh plugin --profile <scratch> add ./<tarball>`）后挂载成功——`dsh --profile <scratch> --dump-config` 可见插件层——且无构建脚本提示。
- 向 main 推送新的 `dsh/package.json` 版本后 `dsh-release.yml` 端到端跑通——门禁、带 provenance 的 npm 发布（纯版本 `latest`、`-rc.*` `next`）、tag `dsh-v<version>`、附 tarball 资产与 commit 生成 notes 的 GitHub Release——且对已发布版本的重跑不发布任何东西。
- `ci.yml` 校验 `dsh/prek.toml` 并对路径命中的变更跑 dsh lane；本批次 `prek run --all-files` 绿。
- `dsh/README.md` 双语对以 `dsh plugin add` 安装说明、版本线、次级渠道取代手写挂载说明；仓库带 `dsh-plugin` topic。awesome-dsh-plugin 的 PR 等 `0.0.x` 线稳定后再起草——不在本批次。

## Risks

推送驱动意味着任何携带未发布版本的 main push 都会触发发布，早 bump 就早发布；防线在于 bump 本身就是一行显式、可评审的改动，且门禁仍会拦下坏代码——失败时 main 持有一个未发布版本，下一次 push 会重试。npm 发布超出短暂窗口后不可撤销，坏掉的 `0.0.x` 切片用下一个切片回答，绝不靠删除。`latest` 指向 dogfooding 的 `0.0.x` 意味着早期用户会踩毛边——这正是该版本线的自我声明，README 亦明示。harness alpha 通道可能在 peer 之下改名 seam；分发继承集成记录的「同批次 bump」纪律。工作流用 `GITHUB_TOKEN` 回推 tag；选 `dsh-v*` 前缀正是为了让现有 `v*` 触发器都匹配不到它。awesome-dsh-plugin 的评审是人，可能改类目或延后收录；npm 分发不等它。provenance 与发布在 Trusted Publishing 替代前都骑在 org 级 `NPM_TOKEN` 上——一个拥有 org 范围发布权的常驻密钥，仅以 Actions secrets 隔离和已记录的迁移意向缓解。
