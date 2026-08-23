# GS-RFC: 新增 docs/ 目录收纳运维手册

Status: proposed

[English](2026-08-22-docs-directory-ops-runbooks.md) | 中文

## Problem

把 production 架起来横跨两侧：源站（由 `devops/ansible/deploy.yml` 自动化）与 Cloudflare 边缘——控制台操作，外加一步手工衔接：Origin CA 证书必须复制到 ttyo 上，playbook 只建目录、不取证书。语料中没有第二类内容的家：tier 表把现态设计参考分给 `specs/`、常令分给 `AGENTS.md`、决策分给 `.agents/gs-rfcs/`，且 tier 表明确把部署手册排除在根文件之外。边缘侧的操作步骤在仓库中无处存在。

## Proposal

新增顶层 `docs/` tier 收纳运维手册——给人执行的生产操作步骤（部署、证书轮换、CIDR 同步）。分工：`specs/` 描述系统是什么，`docs/` 描述如何运维它。该 tier 遵守[文档标准](../../../specs/AGENTS.md)的全部规则，仅有两个例外：不进 `specs/index.md`（它不是 spec）、不设词数上限（预算只约束 agent 指令文件）。首个住户：`docs/deployment.md`（+ `.zh.md`），Cloudflare 上架手册——zone 接入、代理 A 记录、Full (strict)、Origin CA 签发、证书上机 ttyo、部署与验证、以及周期性维护项。同一变更在 `specs/AGENTS.md`（+ zh）加 tier 表行，在根 `AGENTS.md`（+ zh；`CLAUDE.md` 经 `scripts/sync_agents.py` 跟随）加结构图行，并把根文件词数上限 900 → 910：该文件原本已是 899 词，任何新目录的结构图行都放不下，该动的是上限，而不是无关的散文。

## Alternatives considered

**`specs/deployment.md`。** 落败：零标准变更且有门禁索引，但它会把一份编号的控制台步骤种进设计参考 tier——手册是另一种文体，所有者宁可新开一个显式的运维 tier，也不想撑大 `specs/`。

**`devops/DEPLOY.md` 放在 playbook 旁。** 落败：它沿用 `web/DESIGN.md` / `e2e/MANUAL.md` 的树旁先例，但手册的重心在 Cloudflare 控制台，而控制台在本仓库没有对应的树；顶层 tier 匹配的是受众（运维 production 的人），不是某个工具目录。

**把步骤折叠进根 `AGENTS.md` 的部署小节。** 落败：tier 表已把部署手册排除在常令之外，且 900 词的上限容不下一份流程。

## Acceptance criteria

- `docs/deployment.md` 与 `docs/deployment.zh.md` 存在，且通过全部六道文档门控。
- `specs/AGENTS.md`（+ zh）携带带分工规则的 `docs/` tier 行；根 `AGENTS.md`（+ zh，`CLAUDE.md` 镜像）在结构图中列出 `docs/`。
- `python3 scripts/doc_sync.py` 全绿。

## Risks

参考形态的内容出现第四个家（README / `specs/` / `docs/` / 树旁）可能碎片化可发现性；tier 表里的分工规则与结构图行是护栏。`docs/` 没有类似 `specs/index.md` 的机器索引，里面的手册靠浏览或入链找到——在该 tier 只有一份文档时可接受。
