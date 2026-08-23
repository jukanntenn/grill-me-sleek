# AGENTS.md — specs/（文档标准）

[English](AGENTS.md) | 中文

本文件拥有全语料文档标准。每条规则都点名强制它的门控；门控经 [`scripts/doc_sync.py`](../scripts/doc_sync.py) 在提交时（prek `doc-check`）与 CI（`prek run --all-files`）运行。门控失败修文档，而不是修门控。

## One fact, one home

| 事实                  | 归属                                    | 不属于此处               |
| --------------------- | --------------------------------------- | ------------------------ |
| 每个会话的常令        | 根 `AGENTS.md`                          | 树内细节、部署步骤       |
| 单棵树的命令          | 子树 `AGENTS.md`                        | 根文件已承载的仓库级规则 |
| 行为原则              | `PRINCIPLES.md`                         | 各树命令                 |
| 现态设计参考          | `specs/`（由 `index.md` 索引）          | 决策理由、变更故事       |
| 运维手册              | `docs/`                                 | 设计散文、agent 命令     |
| 决策为什么是这样      | `.agents/gs-rfcs/`                      | specs 正文               |
| 面向用户的产品文档    | `README.md`、`cli/README.md`            | agent 命令               |
| 只增的历史账本        | `CHANGELOG.md`（刻意不受门控）          | 任何现态内容             |
| 可复用的 agent 工作流 | `.claude/skills/`（镜像生成，绝不手抄） | 散文文档                 |

`web/DESIGN.md` 与 `e2e/MANUAL.md` 是住在各自树旁的 specs 级参考；它们遵守此处的每一条规则。`docs/` 收纳运维手册——如何运维 `specs/` 所描述的系统。它遵守此处的每一条规则，除了不进 `specs/index.md` 索引、不设词数上限（预算只约束 agent 指令文件）。

## Rules

1. **现态行文。** README、specs 与参考页描述"是什么"——绝不写 "previously / no longer / 此前 / 不再"。点名活的机制，why 链接到拥有它的 GS-RFC。由 `verify_doc_current` 门控。
2. **机器可查的链接。** 相对 Markdown 链接、真实目标、真实 `#fragment` 锚点；绝不使用裸文件名或文字引用。由 `verify_md_links` 门控。
3. **双语对。** 每个未豁免的文档都在同目录配一个等权的 `foo.zh.md`，一起更新：标题层级序列相同、围栏代码块字节相同、中文侧二级标题与机器 token 保持英文、顶部附近有语言切换行、英文侧不得出现中文正文。排版：CJK 与拉丁字符之间加半角空格、中文标点用全角。术语种子：pair 文件对、twin 镜像、gate 门控、corpus 语料、decision record 决策记录、standing orders 常令、spec 设计参考、ledger 账本。豁免清单：`scripts/doc_languages.manifest.json`。由 `verify_doc_pairs` 门控。
4. **词数预算。** agent 指令文件带 `scripts/doc_budgets.manifest.json` 中的上限；预算文件失踪即失败。红了时：先迁移到归属 tier，再压缩，最后才带理由的 manifest diff 提上限。由 `verify_doc_budgets` 门控。
5. **specs 有索引。** spec 文档与它在 `specs/index.md` 中的行同进同出；索引只链接存在的文件。`rust-guidelines.md` 是 vendored 材料，豁免所有门控，但仍被索引。由 `verify_specs_index` 门控。
6. **决策记录遵守 GS-RFC 契约**（命名、生命周期骨架、强制 Alternatives）。由 `verify_gs_rfc_format` 门控。

删除或重命名文档是原子操作：两种语言一起移动、修复所有入链、更新索引与相关记录——一次变更完成。
