# @grilling-sleek/dsh-tool-grill-user

[English](README.md) | 中文

一个 DeepSeek Harness（dsh）插件，给 agent 提供 `grill_user` 工具：每次
调用一个决策树分支的结构化提问、每题带推荐答案、用户的决策以结构化
JSON 返回。它是 grill-me-sleek 在 dsh 上的分发渠道——与 CLI 及打包技能
共用同一个 Hub 与应答页，但以原生 Cordis 插件形态挂载。

## How it answers

`grill_user` 同时在两条链路上提问，先答者胜：

- **下游** —— 原生 `userQuestions` 瀑布：桌面卡片、IM 桥、远程 App。
  组合里已有的每个应答端零代码可用。
- **Hub** —— 配置的 Hub 上的一个 grill-me-sleek round。用户在任意网络
  打开应答页（`https://<hub>/#session_id`）作答。

Hub round 在卡片发出前先开出（受 2 s 揭示预算约束），因此应答页 URL 随
问题卡片而行——附在第一个问题的说明行，即每个作答者都会看到的那一页
——并按 round 记一次日志；在哪个面看到就在哪面作答。开不出的 Hub round
把该轮降级为仅卡片作答（告警一次；结果随之不带 `hub`）。

败者收敛：Hub 胜则各端撤卡（网关 cancel 帧）；下游胜则把答案代理提交
至 Hub，冲突时修订，使两边一致。Harness 会话日志经由工具调用本身记录
round——参数承载问题、结果承载答案与开出的 Hub 链接——回放与历史因此
看得到问过与答过什么。

## How revisions reach the agent

Hub 是答案的唯一真相源，而会话存活期间用户随时可在应答页修订任意已答
轮。agent 已收到的一切都是带每轮 revision 水位线的缓存视图，由三层机制
收敛——watcher 加速送达，另两层保证零丢失：

1. **修订 watcher。** 自第一个成功开出的 round 起，插件读取会话的 SSE
   流（应答页用的同一条）。每个 `response.revised` 取回该轮最新答案并
   以带外方式送达 agent——空闲 agent 被唤醒（`followup`），忙碌 agent
   在其下一个步骤边界收到 inject——连续唤醒有小型预算，一轮应答即回填。
   每次（重）连接都会重放轮次摘要，漏掉的事件或断掉的流经水位线比对
   自愈。Node 没有可靠的全局 `EventSource`，读取器是自带重连与退避的
   小型 fetch 流解析器。
2. **结果增量。** 每个新 round 开出前，插件用水位线与 Hub 对齐，把新
   出现修订的轮次放进结果的 `revisions[]` 字段——每项含轮号、分支名、
   revision 与完整最新答案。
3. **等待通知。** 长轮询循环收集 Hub 附在 pending 响应上的修订通知，
   这些轮的最新答案同样随结果送达。

三层叠加，修订只会在三层同时失败时丢失；水位线比对消解跨层重复。失败
或中止的 round 会取消 Hub 会话并重置链接（下一次调用开全新会话）；agent
消亡时尽力取消会话——应答页会如实告知，而不是继续收集再无人读的修订。
除此之外插件从不关闭会话：会话活到 TTL（公共 Hub 上为一小时），这段
生命周期就是用户的修订窗口。skill 正文教给模型与之匹配的纪律：每轮以
最新 revision 为准，且不存在也不需要任何关闭动作。

## Install

前提：先装好 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）本体。然后一条命令：

```sh
dsh plugin --profile web add @grilling-sleek/dsh-tool-grill-user
```

重启 profile——安装到此为止。包随附自身的 `cordis.patch.yml` bundle
patch，CLI 的插件协调器据此把它挂进 profile 的 bundle 栈；无需改任何
profile 文件。

开箱即用：每一轮默认在公共 Hub `https://grillingsleek.online` 上竞速——
与 CLI 及打包技能共用同一个应答页——浏览器应答面零配置可用。要改指向
自托管 Hub（或进入 hubless），在任意更后层的 layer（profile 自己的
`cordis.patch.yml` 或 `--patch` overlay）重插插件行并带 `config` 块
——按行以后层为准：

```yaml
- insert:
    - id: tool-grill-user
      name: "@grilling-sleek/dsh-tool-grill-user"
      config:
        baseUrl: "https://your-hub.example.com"
```

`baseUrl: ""` 即 hubless 模式：user questions 是唯一应答面，此时无应答端
的 profile 会立即失败而不是挂起。

| Field                  | Default                        | Meaning                                       |
| ---------------------- | ------------------------------ | --------------------------------------------- |
| `baseUrl`              | `https://grillingsleek.online` | 服务应答页的 Hub 源；`''` 切换为 hubless 模式 |
| `maxQuestionsPerRound` | `16`                           | 每轮接受的最大问题数（1..64）                 |
| `roundTimeoutMs`       | `14400000`                     | 一轮最长挂起时间，到点以 expired 收口         |

插件同时以 runtime 方式注册 `grilling-sleek` 采访技能（存在技能注册表
时），因此 `/grilling-sleek` 与模型匹配触发无需单独安装技能。

次级渠道：每个 `dsh-v*` GitHub Release 都附带打包好的 tarball ——
`dsh plugin --profile web add ./grilling-sleek-dsh-tool-grill-user-<version>.tgz`
——git 固定引用亦可（`dsh plugin --profile web add github:jukanntenn/grill-me-sleek#<sha>`）。
git 安装拉取源码并运行 `prepare` 构建，需先在 profile 的
`pnpm-workspace.yaml` `allowBuilds` 里放行本包。

## Version line

`0.0.x` 是 dogfooding 切片，发布为 npm `latest`——不带 tag 的安装即骑
当前切片。自 `0.1.0-rc.1` 起，预发布走 `next`，`0.1.0` 把 `latest` 交回
稳定线。发版由把 `dsh/package.json` 的版本号 bump 推到 `main` 触发；工作
流完成发布、打 `dsh-v<version>` tag、并创建附带 tarball 的 GitHub
Release（[GS-RFC 2026-09-01](../.agents/gs-rfcs/proposed/2026-09-01-dsh-plugin-distribution.zh.md)）。

## The interview discipline

一次一个分支；稳定的 `grill_` 前缀 snake_case 问题 id；两个及以上选项
并标出推荐（`recommended` + `explanation`）；无选项的问题即自由文本。
仅限主 agent——被拥有的 subagent 没有人类应答者，其调用在任何 round
诞生之前即被拒绝。答案以 `{ roundId, hub?: { sessionId, url },
revisions?: [...], answers: [{ id, selected, custom? }] }` 返回——只要该
轮在 Hub 上开出，`hub` 即在；更早轮次有变化时带 `revisions`——含合成
的 `grill_additional_notes` 追问。

运行时 skill 正文把以上纪律承载为显式的 Construction rules 清单。工具
schema 的强制子集表达不了值约束（没有 pattern、minItems、minimum），
`mapping.ts` 只能在 execute 期校验它们；这份清单是模型在首次调用前
唯一能看到它们的渠道，靠 JSDoc 交叉引用与校验保持同步，直到机械式
门禁取代这层散文锚定
（[GS-RFC 2026-09-02](../.agents/gs-rfcs/implemented/2026-09-02-dsh-skill-construction-rules.zh.md)）。

## Known limitations

- **无自定义会话事件。** Harness 的持久化读取路径会拒绝其生成目录之外
  的事件类型，而只有仓库内包能进入该目录——因此本插件经由标准工具
  调用与结果记录 round，而非专用 `grilling/*` 事件族。未来的上游贡献
  可以在不变更工具的前提下恢复专用事件族。
- **败者面只看到裸撤卡。** cancel 帧无 payload：其余端只知问题被取消，
  看不到获胜答案。
- **Hub 收敛尽力而为。** 代理提交或修订失败仅记录并吞掉；round 已在
  会话日志中应答。
- **开不出的 Hub round 降级该轮。** 调用仅靠卡片作答（告警一次，结果
  不带 `hub`）；`baseUrl` 配错时因此什么都不收敛——告警与缺失字段即
  其诊断面。
- **迟到应答按设计丢弃。** 竞速落定与撤卡到达之间几毫秒内提交的应答
  会被其所在面接受后静默丢弃。
- **修订送达只降级、不设卡。** watcher 是加速器：屏蔽 SSE 的部署仍会在
  下一次 `grill_user` 调用的结果增量处收敛全部修订；唤醒预算意味着连续
  超过三次的空闲期修订（其间无应答轮）会改为 inject（停放到下一个步骤
  边界）而不是唤醒 agent。
- 本包追踪已发布的 dsh alpha 频道（`0.1.2-alpha.x`）；预发布期的
  Harness 可能重命名 seam，本包随之跟进。

设计依据与落选方案见
[GS-RFC 2026-08-31](../.agents/gs-rfcs/implemented/2026-08-31-dsh-grilling-integration.zh.md)
与 [GS-RFC 2026-09-02](../.agents/gs-rfcs/implemented/2026-09-02-dsh-revision-awareness.zh.md)（修订模型）。
