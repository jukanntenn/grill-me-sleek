# Coding principles

[English](PRINCIPLES.md) | 中文

对 agent 的行为约束。每一条都是"不告诉就会做错"的规则。生产安全与数据完整性凌驾于这里所有原则之上——包括从零重写的授权；与单纯的默认值或风格规则相冲突时，原则获胜。

## Ground every conclusion in fact

库的事实、API 与协议必须先读源码或文档再行动——训练数据是盲区，不是来源。每个结论都要落到可验证的地面证据：逻辑用 `file:line`，UI 用无头浏览器（playwright），运行中的服务用只读命令（`curl :8000/v1/healthz`），且必须是模型真正能执行的手段（不做截图分析）。纯算法或语法知识可以用训练知识。

做错的典型形状：凭记忆猜一个 axum extractor 或 sqlx 宏——要么对着锁定版本编译不过，要么更糟：运行时静默行为异常。

## Defer to community convention

当约定或最佳实践不确定时，问"社区/官方约定是什么？"并对照权威开源源码验证，而不是凭训练记忆（例如 `format`/`lint` 是不是 prek 的组名、哪些生成物该豁免格式化）。

与 _Ground every conclusion in fact_ 的区别：那条管"你要集成的库的事实"，这条管"约定与最佳实践决策"。

## Converge before you implement

spec 或计划必须自包含、完整、无歧义——一个没有品位的执行者能机械落地，没有即兴发挥的余地。实施前解决每一个悬而未决的点；不要靠半成品计划开工。

## Fix the root cause, not the symptom

选择的方案必须是最自然、最优的——不是贴在症状上的补丁，也不是被既有实现困住的方案。当根因修复需要时，可以抛开全部遗留、从零开始。

当 hook 覆盖在各 agent 工具间泄漏时，修法不是逐个工具补 hook 注册，而是委托给 `prek.toml` 作为单一事实（AGENTS.md §10）。

## Design from first principles

从业务本质推导设计；每个前提都可打破；优雅的方案胜过继承来的方案。与 _Fix the root cause, not the symptom_ 的区别：那条讲怎么**修**问题（根因，不是补丁），这条讲怎么**设计**系统（重新推导、质疑假设）。

## Single source of truth

每一类信息——命令、格式化/lint 调用、agent 规则、技能定义——都只有一个权威来源。镜像是生成的，绝不手改。

`prek.toml` 拥有每一次格式化器/linter 调用（CI 跑同样的钩子）；`AGENTS.md` 是 agent 规则文件（`CLAUDE.md` 与镜像技能由 `scripts/sync_agents.py` 生成）；server 定义 REST/SSE 契约——web 和 cli 只消费，不自留副本。

## Naming is part of the API

名字就是 API 表面。如果一个名字不符合它的业务含义，不要硬用—— brainstorm 候选并让用户选择，防止语义漂移。

## Degrade gracefully, never silently

失败必须被处理、被可观测地记录，并且不阻塞下游工作——但静默失败永远是错的。警示形状：一个配置值解析失败，代码无信号地回退默认值，整个服务在无人知晓中降级。

## Minimal mock, maximal real

只 mock 请求边界，绝不 mock 整个服务。E2E 驱动真实的 docker-compose.local 栈——真实 server、真实 SQLite、真实浏览器；单元测试留在各包内。本地与 CI 尽可能跑同一套最完整的套件。
