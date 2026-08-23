# GS-RFC: 引入 agent harness 机制——GS-RFC 决策记录、分层 agent 指令、文档门控与双语语料

Status: implemented

[English](2026-08-22-agent-harness-mechanism.md) | 中文

## Problem

本仓库的运转依赖 AI agent 的劳作，却既没有持久的决策记忆，也没有机械化的文档检查。根 `AGENTS.md` 曾是一个 1,448 词的单文件，覆盖三个工具链外加构建与部署——为了改一个 CLI 的错别字，每个会话都要加载一遍 staging 拓扑；而且它的结构图已经漂移：`specs/`、`tests/`、`skills/` 在磁盘上存在，图中却没有列出。`CLAUDE.md` 是方向性复制，会静默覆盖更新的一侧；镜像门控还有一个活洞：`scripts/check_agents.py` 校验四个镜像技能，而 `scripts/sync_agents.py` 同步五个，于是 `.zcode/skills/iterating` 的漂移不会被发现。决策的理由——为什么 prek 是唯一的门控来源、为什么构建必须离线、为什么 production 只走 Cloudflare——只活在 git 历史里，一个善意的 agent 完全可以把一个深思熟虑的取舍反转掉，而没有任何东西记得它为什么是这样。文档语料的语言是混合的（中文原生的 `specs/`、英文的 `AGENTS.md`/`PRINCIPLES.md`、下划线命名的 `README_zh.md`），而链接、配对完整性、预算都没有任何检查。markpost 项目针对同类问题适配了 deepseek-harness 机制；它的决策史（那里的 `.agents/mrfcs/`）是证据基础——按触发信号逐件移植，绝不整搬。

## Decision

机制一批落地，并按本仓库的约定塑形：prek 仍是唯一的门控来源，scripts 仍是 stdlib-Python，agent 工具适配器仍是薄层。共六个部分。

### 1. GS-RFCs——`.agents/gs-rfcs/` 下的决策记录

每份 GS-RFC 位于 `.agents/gs-rfcs/{lifecycle}/yyyy-mm-dd-topic-title.md`，并带一个 `.zh.md` 镜像。日期为该主题首次提议的日子（依 git 历史）。生命周期树即清单——没有需要维护的索引文件。

- **`proposed/`**——实施前接受评审的提案。尚未构建，或只构建了一部分。
- **`implemented/`**——决策已随代码落地，以现在时记录。此后代码更名时，记录里的事实随同一批变更更新——但绝不允许把一份记录改写成另一个决策；用新的 GS-RFC 取代它并互相交叉链接。
- **`rejected/`**——提案被认真考虑后否决。只在其理由能阻止一个诱人错误时保留；否则删除。

头部块精确为 `# GS-RFC: <title>`，其后一行 `Status:` 与所在目录一致（`proposed`、`implemented` 或 `rejected — <一行理由>`）。正文以 `## Problem` 开篇，且必须脱离解决方案也能成立；`proposed/` 依次为 Proposal / Alternatives considered / Acceptance criteria / Risks；`implemented/` 依次为 Decision / Alternatives considered / Consequences；`rejected/` 冻结提案期的全部章节。`## Alternatives considered` 强制——每个真实候选一段加粗领起的文字，写明它为何落败。交叉引用一律使用相对 Markdown 链接、绝不使用裸文字。完整契约见[树的 README](../README.zh.md)，至多三条会话令放在[它的 AGENTS.md](../AGENTS.zh.md)；由 [verify_gs_rfc_format](../../../scripts/verify_gs_rfc_format.py) 强制。

每个非平凡变更都必须在同一批变更中新增或更新至少一份 GS-RFC。当变更触及行为、架构、跨文件契约、工具链、测试策略、磁盘或线上格式时，即为非平凡。纯机械或局部编辑豁免；更新已拥有该决策的记录同样满足规则——先 grep `.agents/gs-rfcs/` 找到主题。根 `AGENTS.md` 的 GS-RFCs 一节承载此规则，`writing-gs-rfcs` 技能拥有这套工作流。

### 2. 分层 agent 指令与方向无关镜像

根 `AGENTS.md` 只保留会话常令——概览、仓库地图、git 工作流、边界与指针——并受词数预算约束；每个组件树有自己的文件，承载该树需要的命令与风格。子树文件是对根的补充，绝不重复。上限记录在 [doc_budgets.manifest.json](../../../scripts/doc_budgets.manifest.json)，由 [verify_doc_budgets](../../../scripts/verify_doc_budgets.py) 按 relocate → condense → raise-last 策略门控：

| 文件 | 上限（词数） |
| --- | --- |
| `AGENTS.md`（根） | 900 |
| `server/AGENTS.md` | 450 |
| `web/AGENTS.md` | 250 |
| `cli/AGENTS.md` | 250 |
| `e2e/AGENTS.md` | 150 |
| `specs/AGENTS.md` | 600 |

每个 `AGENTS.md` 旁边都有一个字节相同的 `CLAUDE.md`。镜像对没有主从：方向按对子对照 git HEAD 判定——绝不用 mtime，clone 和 checkout 都会把它重置。一侧变更 → 工具同步过去并暂存修复；两侧都变 → 冲突，校验拒绝猜测，报错写明两侧、修复命令与人工步骤。`.zh.md` 镜像是文档对（第 4 部分），不是镜像对——工具的 load path 读英文侧。[check_agents](../../../scripts/check_agents.py) 与 [sync_agents](../../../scripts/sync_agents.py) 保留名字，共享 [agentlib](../../../scripts/agentlib.py) 中的辅助函数，并从 `.claude/skills/` 减去打包的 `grilling-sleek` 技能动态派生镜像集——绝不硬编码，Problem 里发现的 check/sync 清单不一致由此关闭。两个技能加入镜像集：`writing-gs-rfcs` 与 `doc-standards`。

### 3. 文档标准——`specs/AGENTS.md`

[specs/AGENTS.md](../../../specs/AGENTS.zh.md) 拥有全语料的标准：一张 tier 表为每类事实指定唯一的家，外加写作规则——现态行文、机器可查的相对链接、词数预算、双语对。每条规则都点名强制它的门控。[specs/index.md](../../../specs/index.zh.md) 列出每份 spec 文档（rust-guidelines 标注 vendored），[verify_specs_index](../../../scripts/verify_specs_index.py) 双向校验。`specs/rust-guidelines.md` 是外来版权的 vendored 材料，凭 manifest 豁免全部文档门控。

### 4. 全语料双语化

每份文档文件都是等权对：同目录下的 `foo.md` 与 `foo.zh.md`，一起更新；任何语言都不默认获胜。结构严格镜像——标题层级序列相同、围栏代码块字节相同（示例不翻译）、中文侧的二级标题与机器 token 保持英文——顶部附近有语言切换行。排版：CJK 与拉丁字符之间加半角空格，中文标点用全角。范围为全部语料、无二等文件：所有 GS-RFC、每一层 `AGENTS.md`、`PRINCIPLES.md`、`specs/`（三份中文原生 spec 改名 `.zh.md` 并补写英文镜像）、`README.md`（`README_zh.md` 改为 `README.zh.md`）、`cli/README.md`、`web/DESIGN.md`、`e2e/MANUAL.md`（自身中文原生，改名 `.zh.md` 并补英文镜像）。豁免项记录在 [doc_languages.manifest.json](../../../scripts/doc_languages.manifest.json)：`CHANGELOG.md`（只增账本）、`specs/rust-guidelines.md`（vendored）、`skills/`（打包发布物）、agent 工具配置目录（`.zcode/`、`.claude/`、`.codex/`、`.opencode/`、`.agents/skills/`）、`tests/load/`（压测运维报告）。[verify_doc_pairs](../../../scripts/verify_doc_pairs.py) 门控完整性、切换行、结构与语言纯度。

### 5. 经由 prek 的文档门控

[doc_sync](../../../scripts/doc_sync.py)（stdlib Python，与这里所有脚本一致）顺序运行六个门控，每个可独立运行、可按传入文件参数收缩范围——无参数即全量遵循 git 的语料：[verify_md_links](../../../scripts/verify_md_links.py)（相对链接与标题锚点必须可解析）、[verify_doc_current](../../../scripts/verify_doc_current.py)（README/specs/参考页的现态行文）、[verify_gs_rfc_format](../../../scripts/verify_gs_rfc_format.py)、[verify_doc_budgets](../../../scripts/verify_doc_budgets.py)（预算文件失踪即失败，防止更名遗留孤儿预算）、[verify_doc_pairs](../../../scripts/verify_doc_pairs.py)、[verify_specs_index](../../../scripts/verify_specs_index.py)，共享 [doclib](../../../scripts/doclib.py) 中的辅助函数。门控失败必须写明修复方法；门控失败修文档，而不是修门控。提案承诺了五个门控；现态行文规则随落地批次一起带来了强制它的门控——没有门控的规则会违反它自己引入的标准。

prek 的 `doc-check` 钩子（check 组，pre-commit 阶段）以一次全量运行 `doc_sync`——配对与索引门控需要整棵树，且钩子运行器可能分批传文件名；`agents-sync` 钩子覆盖子树 `AGENTS.md`/`CLAUDE.md` 对。CI 不新增任何东西：现有 gate job 本来就跑 `prek run --all-files`，本地绿仍是 CI 绿——这是对 markpost 的一个偏离，它的独立 docs workflow 之所以存在，只因它的 CI lint 通道对 `*.md` 做了路径忽略；我们没有。

暂不采纳、各记录复活触发条件的项：门控调度器（触发：门控超过十个或需要跨门控依赖）；逐对哈希 sidecar（触发：配对文件反复发生合并冲突）；配对 co-change diff 门控（触发：配对反复单独落地）；参考项目的单行段落 wrap 门控（触发：prettier 不再拥有此处的 Markdown 格式化——它现在拥有，第二个裁判只会跟它打架）；翻译技能（触发：中文镜像的一致性出现投诉）；GS-RFC 分类子目录与冻结归档（触发：树增长到约一百份记录以上）。

### 6. 回填与自我绑定

三个历史决策——agent 最可能在没有记录时反转的那些——按引入 commit 考据日期回填为 implemented GS-RFC：[sqlx 离线确定性构建](./2026-07-17-sqlx-offline-deterministic-builds.zh.md)（`75f5908`）、[prek 作为唯一门控来源](./2026-08-15-prek-single-source-of-gating.zh.md)（`935c496`）、[production Cloudflare-only 源站](./2026-08-15-production-cloudflare-only-origin.zh.md)（`0defc11`）。本记录遵守它自己引入的规则：从 `proposed/` 起步、经过评审、在落地机制的这一批中翻转为 `implemented/`——`## Proposal` 改写为现在时的 `## Decision`，验收标准与风险并入 `## Consequences`。

`PRINCIPLES.md` 保持为带配对的活文档——与 markpost 冻结前身的做法不同，因为在这里它是 `iterating` 技能每个会话加载的操作形态；没有出现迁移信号。进行中的压测工作（`server/`、`tests/load/`、`docker/`、`.github/workflows/load-test.yml` 下的未提交变更）本批不触碰：文件集合不相交，门控只看遵循 git 的文件，且 `tests/load/` 已豁免配对。

## Alternatives considered

**整搬参考仓库的机器。** deepseek-harness 运行着依赖图门控调度器、带冻结只增归档的 RFC 分类目录、`.md` + `.zh.md` + `.i18n.yaml` 三件套加 blob-hash 新鲜度记录、symlink 指令镜像、逐生命周期的 AGENTS 文件、覆盖清单——约 5,300 行门控工具服务约 1,150 个双语对。它落败：这里语料小两个数量级，scripts 按约定只用 stdlib-Python，而 markpost 的创始裁决已经检验过整搬路线并否决了它——按触发信号逐件移植，绝不整搬。这条裁决随机制一起引入。

**`docs/rfcs/` 或 ADR 式 `docs/adr/` 位置。** 落败：这里语料在作者与读者两端都是 agent 优先，`.agents/` 是 agent 工具已经汇聚的 load path；ADR 框架只描述已决之事——GS-RFC 还包含评审中的提案与被否决的裁决。

**symlink `CLAUDE.md` 镜像——参考项目的机制。** 构造上零漂移。落败：git 把 symlink 存成 mode-120000 blob，未设 `core.symlinks=true` 的 Windows checkout 会把 `CLAUDE.md` 物化成一个内容为九个字节的普通文件——第一次 Windows clone 就把漂移风险换成了坏镜像。真实文件的方向无关对在所有平台保住这个保证。

**保留方向性 AGENTS → CLAUDE 同步。** 落败：方向性本身就是缺陷，不是可调参数——加载 `CLAUDE.md` 的工具编辑它之后，下一次同步会静默覆盖这份更新。check/sync 技能清单不一致是同一种病的第二个器官：硬编码的平行清单必然漂移。方向无关判定加动态派生同时修掉两个根因。

**只双语化 GS-RFC，其余缓行。** 落败：那会制造二等语料，中文侧永久失去机制之前一切的决策史——而维护者的母语是中文、`specs/` 本就中文原生，等权模型是在描述现实而非强设主语言。存量语料够小（指令与 specs 约 4–5k 词，外加设计与手册页），一批即可归一，与参考项目的规模不同。

**独立的 CI 文档 workflow（markpost 的形态）。** 落败：markpost 的 `docs.yml` 之所以存在，是因为它的 lint 通道对 `*.md` 做路径忽略；本仓库的 CI gate job 无条件跑 `prek run --all-files`。第二个 workflow 会重新引入 prek 存在就是为了消灭的平行门控定义——恰是单一真源原则禁止的回归。

**wrap 门控。** 落败：prettier 已经拥有这里根层级与 `specs/` 层级的 Markdown 格式化；一段一行的单行段落规则是跟第一个裁判打架的第二个裁判。复活触发条件已记录在 Decision §5。

**GS-RFC 索引文件。** 落败：生命周期树就是清单，索引是第二个需要保持诚实的清单。（`specs/index.md` 不同：specs 是没有生命周期目录的平面文档，索引是这棵树给不了的入口。）

**不回填，或回填五份。** 不回填落败：选中的三个约定刻意反直觉——一个绝不能连数据库的离线构建缓存、一个禁止 CI 本地检查的单一门控源、一个拒绝直连流量的 production 源站——恰是称职的 agent 最先"修好"的取舍。回填五份（再加 round revision 流与 e2e 真实栈策略）落败：那两个的 rationale 已经由代码与 `PRINCIPLES.md`（minimal mock, maximal real）承载，记录会复制一个已有的家——违反 tier 表的第一条规则。

**冻结 `PRINCIPLES.md` 并把规则迁入 `AGENTS.md` 约定（markpost 的方向）。** 落败：这里的 `PRINCIPLES.md` 是 `iterating` 技能每个会话加载的操作形态，且被根 `AGENTS.md` 引用；冻结它会为了零已测收益断掉这条链。

## Consequences

文档回归现在会在提交与 CI 中被机械地拦下，决策理由有了归属，指令文件有界、有镜像、方向无关。整套机制是 Python-stdlib，零新增依赖。规则约束它自己的引入——本记录就是它所治理的流程变更，在落地批次中翻转为 implemented，且该批次按其验收清单验证过：`prek run --all-files` 连同新的 `doc-check` 与扩展后的 `agents-sync` 钩子全绿；`specs/AGENTS.md` 的每条规则点名强制它的门控；语料按 manifest 完整配对且 `README_zh.md` 已消失；三份回填以与 commit 一致的日期通过格式门控；每个 `AGENTS.md` 在上限之内且与其 `CLAUDE.md` 字节相同；技能集合由目录派生且 `grilling-sleek` 未被触碰；`specs/index.md` 与树双向一致；进行中的压测文件零差异。

它接受的代价：每个非平凡变更都携带一份新增或更新的 GS-RFC，每次文档编辑都触及一个配对——翻译税是永久的，且是深思熟虑的选择，结构镜像门控让镜像在机械层面保持诚实。根文件浓缩把 server/web/cli 的操作细节移入子树；只读根文件的 agent 会错过树内命令，以指针纪律与"工具读文件时加载子树指令文件"缓解。非平凡变更规则对"存在性"只有社会性强制——没有机械手段检测缺失的记录；由根 `AGENTS.md`、`writing-gs-rfcs` 技能与 review 承载。边缘处的门控误报修文档而不修门控；当真实需要改变门控时，门控变更与促成它的需要同批落地并在此写明。门控失败修文档而非门控——除非门控本身错了，那种情况适用上一句。
