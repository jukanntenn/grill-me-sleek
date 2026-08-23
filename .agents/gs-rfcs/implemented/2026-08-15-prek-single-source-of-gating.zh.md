# GS-RFC: prek 是唯一的门控来源

Status: implemented

[English](2026-08-15-prek-single-source-of-gating.md) | 中文

## Problem

质量门控在并行增生：pre-commit 配置、四个 agent 目录（`.claude`、`.codex`、`.zcode`、`.opencode`）里各自的钩子脚本、以及 CI 定义，都可以各自命名自己的格式化与 lint 调用。每一个平行定义都是一个漂移面——两处一旦不一致，本地绿就不再意味着 CI 绿（随 `935c496` 于 2026-08-15 整合）。

## Decision

一个工具拥有全部门控：prek。根目录加 `server/`、`web/`、`cli/` 的工作区配置定义三个组——`format`（可变异的修复器）、`lint`（只读质量门）、`check`（只读校验）——每个格式化器、linter 与新鲜度检查都只存在于其中一处。`prek run --all-files` 就是 CI gate job 的全部；agent 工具钩子是委托给同一些组的薄适配器（PostToolUse 对被编辑文件跑 `format`，Stop 跑 `lint`），因此 prek 之外没有任何格式化或 lint 逻辑，谁也无法与 CI 漂移。`commit-msg` 钩子经 `scripts/check_commit_msg.py` 强制 Conventional Commits；pre-push 镜像 CI 的 test/build job。[agent-harness 记录](./2026-08-22-agent-harness-mechanism.zh.md)引入的文档门控遵守同一条规则：它们作为 prek 的 `doc-check` 钩子运行，没有独立的 CI workflow。

## Alternatives considered

**保留 pre-commit 加各工具钩子脚本。** 落败：四个 agent 工具各带钩子逻辑就是四个漂移点；prek 的 workspace 与 group 支持让整合成为单一配置族，而不是一条需要记住的约定。

**用 Make/just 任务运行器做入口。** 落败：在同样的命令上加第二个运行器，重新引入了要消灭的平行定义——Makefile 变成事实、prek 沦为它的镜像。

**只在 CI 强制。** 落败：agent 需要每次编辑后就能跑的本地门控（PostToolUse/Stop 钩子）；只有 CI 的强制把每个格式化发现都推到最慢的反馈环上。

## Consequences

构造上本地绿即 CI 绿，新增检查就是新增一个 prek 钩子——没有第二个可放的地方。代价：每个贡献者与 CI 运行器都要装 prek；钩子变更（如文档门控）以编辑共享配置的方式落地，因此天然是全仓库性的；且 `prek run --all-files` 假定整棵树都可被门控，这正是生成物靠显式正则豁免、而非靠约定豁免的原因。
