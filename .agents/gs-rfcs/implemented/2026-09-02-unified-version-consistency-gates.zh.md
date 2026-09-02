# GS-RFC: 统一版本列车，端到端门禁

Status: implemented

[English](2026-09-02-unified-version-consistency-gates.md) | 中文

## Problem

仓库用一个版本号写在九处。把它们拢在一起的是 release skill 里的一份清单——而清单只列了其中四处（`.claude-plugin/plugin.json`、`marketplace.json`、两个 README 徽章），这份清单继承自纯 plugin 项目模板。rc.2 的 release commit（`058c739`）提了全部 manifest——包括 `server/Cargo.toml` 和四个 `package.json`；rc.3（`6311283`）与 rc.4（`bf4602a`）照 skill 字面执行，只提了那四处加 CHANGELOG。列车就此劈开：Cargo.toml 和所有 `package.json` 停在 `0.2.0-rc.2`，而 tag、CHANGELOG、徽章、plugin manifest 走到了 `0.2.0-rc.4`。

两个事实让这次劈开连续两个 release 无人察觉。其一，`release.yml` 在 CI 的临时 checkout 里覆盖 CLI 版本（`pnpm version --no-git-tag-version`）后再发 npm，JS 通道上报 rc.4，看起来一切健康。其二，没有任何一层把推上去的 tag 与 manifest 对过账：ci.yml 只监听 `main` push 和 PR，tag push 不跑任何 prek 门禁，`docker-publish.yml` 则照 `server/Cargo.toml` 现状构建——把 `env!("CARGO_PKG_VERSION")` = 0.2.0-rc.2 烧进了 rc.4 镜像的二进制。

劈开只在生产部署时浮出水面：check_deploy.py 把 `/v1/healthz` 与 `expected_version` 相比，不匹配判部署失败，`a6df4ab` 随即把 `expected_version` pin 到二进制的真实上报值并留注释说明。部署 playbook 的 staging 路径假设根 package.json 会"经 scripts/sync-version.py 同步"到 Cargo.toml——一个没有任何东西强制的假设，而且那个脚本只覆盖八个跟随者中的三个，本身也没接任何门禁。

## Decision

版本在仓库内决定；分层机械门禁让不一致无法提交、无法落库、无法发布。

一条不变量——统一版本列车：根 `package.json`（锚点）、`cli/`、`web/`、`e2e/` 的 `package.json`、`server/Cargo.toml`、`.claude-plugin/plugin.json` + `marketplace.json`、`README.md`/`README.zh.md` 徽章，在每一次提交上携带同一版本。dsh 不是成员——[它走自己的版本线](../proposed/2026-09-01-dsh-plugin-distribution.zh.md)；CHANGELOG.md 是历史，不是 manifest。`scripts/versionlib.py` 一次性定义成员集，配各类读取器与外科手术式改写器（git tag 剥前导 `v`；shields 徽章把 `-` 转义成 `--`；归一化两者都处理），变更工具与门禁在成员资格上不可能各说各话。

门禁是 `scripts/verify_versions.py`——只读、fail-fast、绝不自动修——共四层，每层拦住上一层拦不住的：

1. **prek `version-sync` 钩子**（check 组，pre-commit）：staged 任何一个成员——或门禁自己的脚本——都会全量复查列车，半截版本提升从此无法提交。它是[prek 单一门禁源](./2026-08-15-prek-single-source-of-gating.zh.md)的新成员。
2. **CI**：`prek run --all-files` 本就在每次 push 与 PR 上跑 check 组，钩子零成本加入。覆盖 `--no-verify`。
3. **发布工作流**：release.yml 与 docker-publish.yml 各新增首个 `verify` job，执行 `verify_versions.py --expect <tag>`——两条触发路径（tag push 与 `workflow_dispatch` 手动 version 输入）都校验，因为 tag push 既绕过 pre-commit 也不经过 CI。tag 对不上就不创建 GitHub Release、不发布 npm、不推镜像。release.yml 的 `pnpm version` 发布时覆盖被删除：门禁之下它是死代码，而它正是当年掩盖 npm 侧漂移的机制。
4. **部署**：check_deploy.py 的 healthz 对 `expected_version` 比对——抓住本次事故的那一层。不变量之下 `expected_version` 恒等于 `image_tag`；group_vars 字段保留显式声明，作为已知异常时 deliberate pin 的逃生口（`a6df4ab` 用过的一次）。

变更侧是 `scripts/sync-version.py`：改锚点，它向全列车传播（外科手术式文本改写，不做整体重序列化），随后重读列车，不一致即失败。release skill 的 bump 步骤改为驱动它——改锚点、跑 `sync-version.py`、`cargo update -p grilling-sleek` 刷新 Cargo.lock（其新鲜度本就由 `clippy --locked` 把守）——然后在流程继续前先跑一遍门禁；旧的四文件清单、`README_Zh.md` 拼写、只认 `X.Y.Z` 的校验一并修正，根 `package.json` 的 `npm version` 钩子也改为 stage 全列车。

门禁落地要求先对齐列车——否则钩子出生即红——所以同一批次把掉队者提到 `0.2.0-rc.4`。

## Alternatives considered

**tag 驱动注入（tag 为唯一真源）。** manifest 保持陈旧，构建时注入 tag 版本——二进制走 docker build-arg，npm 沿用既有 `pnpm version`。它输了：仓库内构建将上报陈旧版本，`server/Cargo.toml` 的版本字段沦为死元数据，"healthz 上报 Cargo.toml、部署校验对照它"的既有契约需要重写。本次事故暴露的那些掩盖机制，正是这个方案的常态。

**保留 pin 补丁（`expected_version` 人工维护）。** 它输了：劈开变成制度。每次 release 都要人工对账两个数字，部署校验的含义从"跑的确实是这个 tag"退化为"二进制碰巧上报什么就是什么"。

**manifest 驱动发布，同 dsh 线。** 推送携带新版本即发布、tag 由版本推导——`dsh-release.yml` 正是这么做的，这个反向顺序也正是 dsh 不会以这种方式劈开的原因。它在统一线上输了：v* 的发布仪式——精编 CHANGELOG、确认暂停、多架构镜像加 npm 加 GitHub Release——存在的意义就是审慎，版本 bump 一推即自动发布会把暂停删掉。dsh 的节奏论据（每日 dogfood 切版）在这里不成立。

**只修 skill 清单，不加机械门禁。** 它输了：这就是现状的确切失败形态。rc.2 的完整 bump 活在流程知识里，skill 一换就丢了，两个 release 无人察觉。清单守不住不变量。

## Consequences

半截提升现在死在 `git commit`，劈开的树死在 CI，错误的 tag 死在任何产物诞生之前——漂移再也到不了用户。`--no-verify` 直推 main 仍是事后检测（CI 变红，与文档门禁同一保证等级），但已不可能变成一次发布。代价：成员集是一个约定，任何新的版本承载文件出现都要随之生长——prek 的 `files` 正则与 `versionlib.TRAIN` 必须一起改，漏改一边的新成员在被发现之前处于无覆盖状态；tag 与列车 coupling 之紧，使得不做对齐 commit 就重新打 tag 在设计上不可能（删 tag、修树、重打）；已发布的 `0.2.0-rc.4` 镜像永久上报 `0.2.0-rc.2`——生产的 `expected_version` 保持 pin，group_vars 里有到期注记，直到下一个 release 的镜像部署为止。这笔交易买到的是：一个数字处处成立（by construction），本地绿 == CI 绿 == 发布真相，部署校验恢复本义。
