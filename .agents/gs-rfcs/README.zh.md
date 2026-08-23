# GS-RFC：征求意见契约

[English](README.md) | 中文

GS-RFC 是 grill-me-sleek 的 RFC：持久的提案与决策记录——_为什么_、_放弃了什么_、以及代码与 specs 承载不了的部分。specs 描述现态；GS-RFC 解释现态为什么是这样。本体系由 [agent-harness 记录](./implemented/2026-08-22-agent-harness-mechanism.md)引入——它从 markpost 项目的 MRFCs（在那里适配自 deepseek-harness）按触发信号移植而来，绝不整搬。

## Layout and naming

每份记录位于 `.agents/gs-rfcs/{lifecycle}/yyyy-mm-dd-topic-title.md`。日期为该主题首次提议的日子（依 git 历史）。生命周期树即清单——浏览它或 grep 仓库；没有需要维护的索引文件。

- **`proposed/`**——实施前接受评审的提案。尚未构建，或只构建了一部分。
- **`implemented/`**——决策已随代码落地。文件以现在时记录决定了什么、拒绝了什么。此后代码更名文件或改变默认值时，记录里的事实随同一批变更更新——但绝不允许把一份记录改写成另一个决策；用新的 GS-RFC 取代它并互相交叉链接。
- **`rejected/`**——提案被认真考虑后否决。只在其理由能阻止一个诱人错误时保留；否则删除。

记录之间的交叉引用使用相对 Markdown 链接、绝不使用裸文字，这样 [`verify_md_links`](../../scripts/verify_md_links.py) 才能检查它们，且它们在目录间移动后依然成立。

## When to write one

每个非平凡变更都必须在同一批变更中新增或更新至少一份 GS-RFC。当变更触及行为、架构、跨文件契约、工具链、测试策略、磁盘或线上格式时，即为非平凡。纯机械或局部编辑豁免。更新已拥有该决策的记录同样满足规则——不要创建重复；先 grep `.agents/gs-rfcs/` 找到主题。

## The file format

头部块精确为：

```markdown
# GS-RFC: <title>

Status: <status>
```

`Status:` 与所在目录一致，取三种形式之一：`proposed`、`implemented` 或 `rejected — <一行理由>`（否决理由正是读者要找的事实）。正文以 `## Problem` 开篇，且必须脱离解决方案也能成立。

`implemented/` 依次为 `## Decision`（现在时，已随代码落地的内容）……`## Alternatives considered`……`## Consequences`。提案期标题——`## Proposal`、`## Plan`、`## Migration plan`、`## Acceptance criteria`——在这里被格式门控拒绝。

`proposed/` 依次为 `## Proposal`……`## Alternatives considered`……`## Acceptance criteria`……`## Risks`。工作未落地时提案可以用将来时。

`rejected/` 冻结提案期的全部章节；裁决写在 `Status:` 行上。

每份记录都是双语对：英文原件旁边带一个 `.zh.md` 镜像——同骨架、机器 token 与二级章节标题保持英文——且成对更新（[文档标准](../../specs/AGENTS.md)）。

**每份记录都必须有 `## Alternatives considered`**——每个真实候选一段加粗领起的文字，写明它为何落败。没有记录"它打败了什么"的决策会招来重复诉讼，这正是 GS-RFC 要预防的失败。备选方案按当时实际争论的样子记录，绝不事后编造。

在生命周期目录之间移动文件意味着同一批变更里更新 `Status:` 行并满足目标目录的骨架：`proposed/` → `implemented/` 把 `## Proposal` 改写为现在时的 `## Decision`，并把 `## Acceptance criteria`/`## Risks` 并入 `## Consequences`；`proposed/` → `rejected/` 只在 `Status:` 上加理由并冻结文件。

[`verify_gs_rfc_format`](../../scripts/verify_gs_rfc_format.py) 强制以上全部；它作为 [`doc_sync`](../../scripts/doc_sync.py) 的一部分运行。
