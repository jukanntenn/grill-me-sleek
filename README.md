English | [简体中文](./README_zh.md)

<div align="center">

# grill-me-sleek

**Stress-test your plan before vibe coding.**

The AI asks you questions to build a shared understanding — you answer in a sleek web UI.

<br />

<img src="screenshots/demo.png" alt="grill-me-sleek in action" width="720" />

<br />

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Version](https://img.shields.io/badge/version-0.1.2-brightgreen.svg)](https://github.com/jukanntenn/grill-me-sleek) [![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-orange.svg)](https://github.com/jukanntenn/grill-me-sleek)

</div>

---

## Quick Start

The commands below are for Claude Code. More tools coming soon — see [Platform Roadmap](#platform-roadmap).

```bash
/plugin marketplace add jukanntenn/grill-me-sleek
/plugin install grill-me-sleek@jukanntenn
```

Then just say:

> *"Grill me on my plan to migrate the auth service to OAuth 2.0"*

The AI generates a batch of questions, opens a web page in your browser with recommended answers pre-selected, and waits for your response. If new questions come up, the next batch loads in the same tab.

## What It Does

You describe a plan. The AI finds every hole, assumption, and unclear decision — and puts them all on the table at once.

1. You describe your plan or design.
2. The AI analyzes it and generates a batch of questions, each with a recommended answer and alternatives.
3. You review all questions on a web page, pick your answers, and submit.
4. The AI processes your answers. If anything new comes up, the next batch appears in the same tab — no manual refresh.

No back-and-forth in the terminal. No scrolling through pages of questions. Just focused review.

## How It Works

```
  You describe your plan
          │
          ▼
  ┌─────────────┐
  │    AI       │  Analyzes, generates
  │  generates  │  a batch of questions
  │  questions  │  with recommendations
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Browser UI │  Web page opens
  │  (auto-open)│  automatically
  └──────┬──────┘
         │
         ▼
  You review & submit
         │
         ▼
  Next batch if needed  →  Done ✓
```

## grill-me-sleek vs grill-me

| | grill-me-sleek | grill-me |
|---|---|---|
| **Questions** | ⚡ All at once, in a web page | One at a time, in the terminal |
| **Recommended answers** | ✅ All pre-selected — bulk review | Yes, but confirm one by one |
| **Multi-batch iteration** | 🔄 Automatic — next batch in the same tab | Manual back-and-forth |
| **Interface** | 🖥️ Browser-based, clean layout | Terminal only |
| **Browser support** | 🌐 macOS, Linux, WSL auto-open | N/A |
| **Review time** | ⏱️ Typically ≤ 5 minutes | Usually 10–30 minutes |

## Platform Roadmap

| Platform | Status |
|---|---|
| Claude Code | ✅ Supported |
| OpenAI Codex | 🔜 Planned |
| OpenCode | 🔜 Planned |
| Trae | 🔜 Planned |

## Install

**Claude Code (via marketplace):**

```bash
/plugin marketplace add jukanntenn/grill-me-sleek
/plugin install grill-me-sleek@jukanntenn
```

## Use Cases

| What you want | What to say |
|---|---|
| Review an architecture choice | *"Grill me on choosing gRPC over REST for the payment service"* |
| Validate a migration plan | *"Stress-test my plan to migrate from MySQL to PostgreSQL"* |
| Align on a new project | *"Grill me on the roadmap for the new dashboard feature"* |
| Check a debugging approach | *"Review my approach to fixing the memory leak in the worker pool"* |

## License

[MIT](LICENSE) © jukanntenn
