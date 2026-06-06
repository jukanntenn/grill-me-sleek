[English](./README.md) | 简体中文

<div align="center">

# grill-me-sleek

**Vibe coding 之前，先把需求对齐。**

Agent 帮你把方案里的坑都找出来，再动手写代码。

<br />

<img src="screenshots/demo.png" alt="grill-me-sleek 演示" width="720" />

<br />

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Version](https://img.shields.io/badge/version-0.1.2-brightgreen.svg)](https://github.com/jukanntenn/grill-me-sleek) [![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-orange.svg)](https://github.com/jukanntenn/grill-me-sleek)

</div>

---

## 快速开始

以下以 Claude Code 为例，后续会支持更多工具，见[平台支持](#平台支持)。

```bash
/plugin marketplace add jukanntenn/grill-me-sleek
/plugin install grill-me-sleek@jukanntenn
```

输入以下内容即可触发：

> *"Grill me on my plan to migrate the auth service to OAuth 2.0"*

Agent 会一次生成所有问题，在浏览器打开页面等你回答。如果有新问题，下一批会在同一个标签页自动加载。

## 功能说明

你描述一个方案，Agent 帮你找出里面的问题、假设和不确定的地方，一次性列出来。

1. 你描述方案或设计。
2. Agent 分析后生成一批问题，每个问题附带推荐答案和备选项。
3. 你在网页上批量审阅，选答案，提交。
4. Agent 收到回答后继续处理。如果有新问题，下一批在同一个标签页自动加载，不用手动刷新。

不用在终端里一问一答，不用翻半天才看到问题，快速过完方案。

## 工作流程

```
  你描述你的方案
          │
          ▼
  ┌─────────────┐
  │    Agent     │  分析方案，生成一批问题
  │  生成问题    │  每个问题附带推荐答案
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  浏览器页面  │  网页自动打开
  │  (自动打开)  │
  └──────┬──────┘
         │
         ▼
  你审阅并提交答案
         │
         ▼
  如有需要继续下一批  →  完成 ✓
```

## grill-me-sleek vs grill-me

|  | grill-me-sleek | grill-me |
|---|---|---|
| **提问方式** | ⚡ 一次性出完，在网页里 | 逐个追问，在终端里 |
| **推荐答案** | ✅ 全部预选好，批量审阅 | 有，但需要逐个确认 |
| **多轮迭代** | 🔄 自动——下一批在同一标签页加载 | 手动来回对话 |
| **界面** | 🖥️ 浏览器，排版清晰 | 只有终端 |
| **浏览器支持** | 🌐 macOS、Linux、WSL 自动打开 | 不适用 |
| **审阅耗时** | ⏱️ 通常 ≤ 5 分钟 | 通常 10~30 分钟 |

## 平台支持

| 平台 | 状态 |
|---|---|
| Claude Code | ✅ 已支持 |
| OpenAI Codex | 🔜 计划中 |
| OpenCode | 🔜 计划中 |
| Trae | 🔜 计划中 |

## 安装

**Claude Code（marketplace 安装）：**

```bash
/plugin marketplace add jukanntenn/grill-me-sleek
/plugin install grill-me-sleek@jukanntenn
```

## 使用场景

| 你想做什么 | 可以这样说 |
|---|---|
| 评审架构选择 | *"Grill me on choosing gRPC over REST for the payment service"* |
| 验证迁移方案 | *"Stress-test my plan to migrate from MySQL to PostgreSQL"* |
| 对齐项目规划 | *"Grill me on the roadmap for the new dashboard feature"* |
| 确认调试思路 | *"Review my approach to fixing the memory leak in the worker pool"* |

## 许可证

[MIT](LICENSE) © jukanntenn
