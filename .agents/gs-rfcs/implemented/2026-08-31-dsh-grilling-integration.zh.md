# GS-RFC: DeepSeek Harness 集成——`grill_user` 作为 Hub 的一等客户端

Status: implemented

[English](2026-08-31-dsh-grilling-integration.md) | 中文

## Problem

grill-me-sleek 今天触达 AI agent 的方式只有一种形态：子进程 CLI（`@grilling-sleek/cli`），由 agent 的 shell 外呼——建会话、轮询 round、推送应答——走公网 Hub，Web SPA 作应答面。这个形态是为「只会执行命令」这类扩展点的 agent 工具设计的。DeepSeek Harness（dsh）恰是相反的宿主：全插件化的 Cordis harness，工具、会话事件日志、审批、agent loop 全是插件，而子进程 CLI 在这里有六层错配——校验架在进程边界错误的一侧、取消（`exec.signal`）传不进 `poll --wait 600`、CLI 的 600 s 预算与工具超时模型冲突、round 状态落进 Hub DB 却与宿主自身的会话日志只有弱关联、审批语义重叠、`npm install -g` 与 Hub 可达性成了部署变量。一次完成的设计会话（v2，经 Harness 参考克隆的源码逐条评审）已定下目标形态；本记录承载其决策并门禁实施——实施落在本仓库的 `dsh/` 树。本仓库的 Hub 只以保持兼容为限进入范围。

## Decision

dsh 是 Hub 的一等 API 客户端，与 CLI 服务的各类 agent 工具完全同位。本仓库新增一个 npm 包——`dsh/`，发布为 `@grilling-sleek/dsh-tool-grill-user`——注册工具 `grill_user`；Hub 零改动。五个决策定义形态：

1. **提问核心原生化。** `grill_user` 把 grilling 提问批次（`schemas/grilling.json` 词表，内化为工具参数 schema）映射到 dsh 的 `ctx.userQuestions.ask()`——waterfall 里既有的每个应答端（官方桌面卡片、IM 桥、远程 App）零代码可用，跨端先到先得按网关到达序裁决。问题 id 强制 `grill_` 前缀。技能以 runtime 注册（`ctx.skills.register`）存续：触发路径不变（`/grilling-sleek` 或模型匹配目录）、采访纪律不变，随插件而行而非单独安装文件。其摘要（digest）点名 `grill_user` 是唯一的 grilling 传输并显式禁止 `@grilling-sleek/cli`，内容（content）亦以同一条传输纪律开篇——实测表明，缺少显式否定时，模型会顺着本仓库文档自带的 CLI 叙事去起子进程，而不是调用工具。
2. **持久记录即工具调用本身。** 针对 Harness 源码的设计评审确认：其持久化读取路径会拒绝生成目录 `KNOWN_SESSION_EVENT_TYPES` 之外的事件类型——而只有仓库内包能进入该目录。仓外插件因此无法追加专用 `grilling/*` 事件族；v2 设计的「仓库内一等包」路线预设了一个我们不拥有的仓库。改为：round 的真源搭载 Harness 为每次工具调用本就写下的记录——调用参数承载完整提问批次、工具结果承载答案——回放、fork 与历史因此看得到问过与答过什么。当 round 在 Hub 上开出时，结果同时携带其链接（`hub: { sessionId, url }`），把本地 roundId 与 Hub 会话挂钩。经由上游贡献补回事件族仍是未来选项，且不必改变工具契约。
3. **两条应答链路在工具 execute 层竞速，而非事件层。** 下游链路是 `userQuestions.ask()`；Hub 链路是针对既有 Hub REST API 的客户端 ≤60 s 窗口长轮询循环（与 CLI 同款端点——`POST /v1/sessions`、`POST .../rounds`、`GET .../response?wait=`、`PATCH .../sessions/{id}`）。专用 `AbortController`（自 `exec.signal` 链接）收敛败者：Hub 胜 → abort 触发网关向其余各端广播 cancel 帧；下游胜 → 工具对 Hub 代理提交，撞 409 携带获胜应答时以 PUT 修订把 Hub 收敛到已记录的结果。headless profile 的 `NO_PROVIDER` 屏蔽为「下游缺席」，绝不作错误处理；竞速不注册任何 `user-questions/request` 监听器，不触碰他人事件。卡片发出前，Hub round 先开出（受 2 s 揭示预算约束），使应答页 URL 随卡片而行（第一问的 `detail`——每个作答者都会看到的那一页；分页式问题 UI 会埋掉靠后问题的 detail，而 URL 的读者是正在决定「在哪作答」的用户，赶在其开始作答之前），并按 round 记一次裸 URL 日志、尾部不带任何字符；表单级横幅才是更自然的表面，但需要宿主 UI 扩展（一个 `intent` 变体），随上游路线一并记录。预算超时后 round 照常开出并竞速，只是卡片无 URL；开 round 的快速永久失败把该轮降级为仅下游作答——告警一次、结果不带 `hub`——而不是让调用失败，而两条链路均无法应答的 round 仍然显式失败。
4. **主应答面是既有 Hub CDN SPA**（`https://<cdn>/#session_id`），与其他 agent 工具共用不变——UX 打磨即静态资源重部署，所有宿主同时受益。SPA 把「他处作答」当作一等事件，因为竞速使之成为常态（工具的代理提交、另一个标签页）：`response.created` 在表单仍在渲染时到达即把页面同步到会话当前状态，fetch 回的已作答 round 永不渲染表单（提交只会 409），`round.created` 自动跟随、不设模态确认——唯一不被打断的是刻意的历史查看，只给非模态提示。Web Push 整体推迟（IM 桥已有平台原生推送；唯一未覆盖的格子——纯浏览器用户关页后——从秒级退化为下次打开发现）。
5. **signal 接线是正确性要求，不是打磨项。** 工具注册表绝不抛弃 body promise，两条链路的每个挂起环节都必须观察竞速控制器；`roundTimeoutMs`（config，默认 4 小时）是唯一的孤儿 round 护栏，经 Harness 的协作式超时策略执行；abort 路径把 `TOOL_TIMEOUT` 原因归类为 expired、其余为 cancelled。

该包将 `@deepseek-ai/dsh-*` peer 钉在已发布的 alpha 频道上，bundle 时全部 peer external（打包 cordis 会分裂其模块单例），并经 `dsh/prek.toml` 自带 vitest/eslint/tsc/prettier 门禁。

## Alternatives considered

**把包落进 Harness 仓库（设计稿的一等包路线）。** 可以解锁专用 `grilling/*` 事件族与其生成目录。落选：该仓库是我们不拥有的上游参考物，其读取路径对第三方事件类型直接拒绝——无论怎么打包，事件族都从这边够不着。记录为未来的上游路线，而非交付方案。

**零代码 skill 投放（dsh 下保留 CLI）。** 把 `skills/grilling-sleek/` 原样投进 dsh 的技能目录，子进程 CLI 继续作传输层。落选：它继承了上述全部六层进程边界错配，而 dsh 的原生 seam（工具、user questions、会话日志）本可删掉整个 CLI 层。它仅作为什么都不装时的 hubless 降级叙事存续。

**webserver 托管应答页作为主应答面（最初的 D3 形态）。** 在 dsh 的 `ctx.webServer` 上以能力令牌托管专用应答页。在迭代杠杆上落选：Hub CDN SPA 已部署、已在服务其他工具、重部署零成本——dsh 专页只买来第二个要维护的应答面，却没有 SPA 缺的任何东西。

**`grill-relay` 出站 WSS 消息中继（D4 中间态）。** Host 内插件经持久 socket 向 Hub 转发 grilling 帧。审计真实 Hub 后撤回：REST + 钳制长轮询 + SSE + 幂等 + 限流已覆盖全部需求，中继只是平添一条要养的连接。

**waterfall 里的独占式 answerer（认领 `user-questions/request` 且不调 `next()`）。** 让 grilling 成为唯一应答端，竞速随之不必要。落选：它把所有生态应答端（IM 桥、远程 App）从 grilling 问题上一刀切断——恰是本设计买下的组合性。

**监听器层竞速（拦截 `user-questions/request` 与 Hub 赛跑）。** v1 的摆位，v2 撤回：拦截需要在别人的事件上判别「这是不是 grilling 的提问」，会波及 plan-review 与其他提问方的流量。execute 层竞速零事件足迹达到同样效果。

**Hub SPA 作为 dsh 远程客户端（消费 `$events` 协议格式）。** 可以白嫖 cancel 帧收敛与先到先得裁决。落选：它把 SPA 焊死在 dsh 协议上，放弃了「一个 SPA 服务所有宿主」的中立性与 Hub 的宿主无关立场。为此在工具内支付收敛接线的成本被判定为更便宜的一侧。

## Consequences

M1 已交付：`dsh/` 下的包——`grill_user` 工具、专用控制器收敛的 execute 层竞速、Hub client（建会话/推 round/轮询循环/代理提交/修订/取消）、runtime 技能注册——且不追加自定义会话事件；`dsh/` 内 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build` 全部通过，工具测试针对本地回环 stub Hub 覆盖竞速结局（下游胜含代理提交与冲突修订、Hub 胜含 `NO_PROVIDER` 屏蔽、hubless+headless 显式失败、用户中止、超时过期、跨 round 共享会话）、应答页 URL 随卡片与结果而行、开 round 失败的仅下游降级、揭示预算超时不丢竞速。`server/` 零行为变更；其 REST 面原样服务 dsh 客户端（长轮询钳制、409 携带获胜应答、PATCH 终态幂等按设计被消费）。分发随后由[分发记录](../proposed/2026-09-01-dsh-plugin-distribution.zh.md)落定：npm bundle 渠道、独立 `0.0.x` 版本线、推送驱动发版。

接受的代价：Harness 处于预发布期，其 npm 包搭乘 alpha dist-tag（`0.1.2-alpha.x`）；seam 重命名以同批次依赖升级落盘。专用 `grilling/*` 事件族在 Harness 仓库之外不可达，未来的结构化 UI 卡片在上游贡献落地前只能基于通用工具记录。cancel 帧无 payload，败者端无法展示获胜答案、无法区分「他处已答」与「提问方撤销」——作为竞速的 UX 代价接受，以已记录结果的权威性、Hub 永远收敛到它来缓解。取消到达前几毫秒提交的迟到应答会被网关接受后静默丢弃；窗口仅为竞速级宽度，且整 round 快照模型保证不会有「半个生效」。Hub 认证保持「持有 session_id 即凭证」；dsh 进程建会后持有它，这正是代理提交所需的全部权限，但意味着 id 泄漏即会话泄漏——与 CLI 时代不变，由同一限流覆盖。降级 round 在没有 Hub 的情况下作答，只有一条告警加结果中缺失的 `hub` 字段作为信号——baseUrl 配错时因此什么都不收敛，这两个信号就是它的诊断面。浮出的 URL 对粘贴敏感（自动链接会吞掉尾部标点），因此第一问的 detail 与日志行都以 URL 结尾，工具 schema 与技能 content 也都指示模型将其单独成行复述。最后，两条链路中任何漏接 `signal` 的分支都会在中断后挂死 agent loop；竞速及其 abort 路径是包内测试最重的面，正是因为这个失败是静默的。M2（Hub 侧推送/outbox）等留存痛点成立再补；M3（聊天内卡片与 hubless 应答页）保持可选。
