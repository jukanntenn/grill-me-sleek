# GS-RFC: dsh skill 构造规则——在 skill 正文中预先披露 `grill_user` 的 execute 期约束

Status: implemented

[English](2026-09-02-dsh-skill-construction-rules.md) | 中文

## Problem

[dsh grilling 插件](2026-08-31-dsh-grilling-integration.zh.md)的实际使用呈现出官方 `ask_user_question` 工具从未出现的「首调拒绝循环」：模型构造的 `grill_user` 批次通过了可见的参数 schema，却在 `execute` 内部被拒——读错误、修正、重提，有时反复数次，因为错误一次只暴露一条被违反的约束。根因是契约可见性缺口，不是 bug：Harness 的强制 JSON Schema 子集只接受结构（`type`/`required`/`properties`/`items`/标量 `enum`/`const`；不支持的关键字在注册时即被拒），因此 `mapping.ts` 校验的十一条值约束——`grill_` id 语法、批内唯一 id、保留追问 id、两个及以上选项、`recommended` 索引在界内、`multiSelect` 须有选项、`maxLength` 为正、branch 与数量的下限——无法出现在模型每个请求都能看到的 schema 里，只以 description 措辞和 execute 期拒绝的形态存在。官方工具从不循环，是因为它的契约整体是结构性的、开放世界的（`additionalProperties: true`、每题仅两个必填字段、推荐用不执法的 label 惯例表达）；`grill_user` 在更严的封闭 schema 之上叠了一层子集装不下的值约束，而每次报错都恰好落在这一层增量上。

schema 本身不是修这件事的地方：它是在独立 `0.0.x` 版本线上演进的公开契约（`dsh/AGENTS.md` 的 ask-first 边界），不该为迎合模型习惯而变形——那是在用活契约换一次性的错误率收益。模型缺的不是另一份 schema，而是在首次 `grill_user` 调用**之前**——而非错误反馈之后——看到 schema 装不下的那些约束。

## Decision

运行时 skill 正文就是这个先验视图。`GRILLING_SKILL_CONTENT`（`dsh/src/skill.ts`）承载一份显式的 **Construction rules** 清单，逐条对应 `mapping.ts` 里 `toQuestions` 的每个值约束——一检查一行，写作「照此构造」的指令——置于采访纪律之后、答案解读指引之前。加载技能（模型匹配或 `/grilling-sleek`）即在拿到纪律的同时拿到完整的拒绝面；工具 description 与参数 schema 一字不动。

选 skill 正文而非工具 description，是因为 description 随每个请求常驻、按 token 计费，而规则只在首次构造时需要一次；正文按需加载，作为普通 skill 历史留存。

清单与校验的同步，今天靠散文锚定：`skill.ts` 的模块 JSDoc 指认 `mapping.ts` 为规则之源；`mapping.ts` 的模块 JSDoc 指认 Construction rules 为每条检查的对应行，要求检查移动时同一变更内移动其行；另有一条测试断言清单（含保留 id）存在于注册内容中，使清单不可能被无声删除。未来的门禁将机械式执法这层同步——从 `toQuestions` 推导或交叉核对清单——取代散文锚定；本记录为它留下这个空位，而不是把当前的手工同步固化为设计。

## Alternatives considered

**重塑工具 schema 以消灭约束。** 砍掉 `grill_` 前缀（它的设计期理由——竞速判别——在竞速移入 `execute` 时已消亡，代码中仅存保留字命名空间）并把 `recommended` 从索引改为 label 引用（消灭范围耦合）。败于方向：schema 是公开演进契约与 ask-first 边界，为讨好模型习惯重塑它是在错误的轴上优化，且披露路线不动 schema 就能拿到同样的首发收益，不值得花费契约扰动。

**上游拓宽强制 schema 子集（pattern/minItems/minimum）。** 一般机制层面的根治——值约束得以随 schema 携带并先验可见。败于归属与架构：Harness 是我们无权控制的上游仓库；且其子集刻意收窄，因为它同时驱动 TS/Python 类型生成（`ts-types`、`py-types`、PTC），值级关键字映射不到任何静态类型——这个提议对抗的是设计本身，不只是评审队列。

**把规则并入工具 description。** 不新增任何面——description 本就可见。败于成本与时机：description 是每请求常驻上下文，规则却只需要一次，十一条规则常驻计费还要挤占本就住在那里的路由指引。

**对 packaged CLI skill 施行同样的生成式内联**（`skills/grilling-sleek/SKILL.md`，从 `schemas/grilling.json` 生成并加 freshness 门禁）。披露论证在那里同样成立——文件读取可跳过、手写 quick reference 会漂移——但本批经决策只做 dsh；CLI skill 维持现状，该路线留给未来的记录。

**接受循环，仅改进错误信息。** `mapping.ts` 的错误已带题 id 与违反的规则，更好的错误能缩短每一轮。败为主方案是因为它把学习保持为由外向内（错误驱动），而本可由内向外（披露驱动）；更优错误在任何路线下都只是兜底层。

## Consequences

模型现在在加载技能时即得到 `grill_user` 的完整拒绝面；首调拒绝应从「取决于 prose 恰好覆盖了什么」降到模型注意力的下限，循环即使触发也应在一次错误轮内收敛，而非每条约束一轮。披露随插件自身的运行时 skill 注册走——不动宿主、不动 schema、不新增包面。

代价是一对手工同步物：`skill.ts` 里的十一条清单行镜像 `mapping.ts` 里的十一条检查，靠 JSDoc 交叉引用、一条测试级存在性锚点和评审纪律维系——在未来的机械式门禁（上文留位）落地前，这是一个已知的漂移窗口。skill 正文增长了清单的体积，属于一次性加载成本，对照的常驻方案按请求计费；且约束的措辞从此活在模型可见的 prose 里，那里的措辞变更具有代码注释所没有的产品可见性。schema 的演进不受影响：`mapping.ts` 增删或放宽约束时，同一变更移动清单中的对应行——这正是本记录对落地批次的预期。
