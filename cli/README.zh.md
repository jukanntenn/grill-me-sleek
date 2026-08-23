# @grilling-sleek/cli

[English](./README.md) | 中文

grilling-sleek 的 CLI 工具——在开始 vibe coding 之前，先对你的计划进行压力测试。

## Features

- 🎯 **交互式问答**：AI 生成问题来压力测试你的计划
- 🌐 **Web UI**：在简洁优雅的浏览器界面中审阅并回答问题
- 🔄 **多轮迭代**：自动进行多轮问答，直到达成一致
- 📊 **JSON Schema 校验**：确保问答数据格式的正确性
- 🔌 **API 集成**：与 grilling-sleek Hub 无缝通信

## Installation

### 通过 npm 安装（推荐）

```bash
npm install -g @grilling-sleek/cli
```

如果遇到网络问题，可以使用 npm 镜像源加速安装：

```bash
npm install -g @grilling-sleek/cli --registry https://registry.npmmirror.com
```

更新：

```bash
npm update -g @grilling-sleek/cli
```

### 从源码构建

```bash
git clone https://github.com/jukanntenn/grill-me-sleek.git
cd grill-me-sleek/cli
pnpm install
pnpm build
```

## Commands

### 基础命令

| 命令            | 说明             |
| --------------- | ---------------- |
| `create`        | 创建新的问答会话 |
| `poll <id>`     | 等待用户提交答案 |
| `push <id>`     | 推送下一轮问题   |
| `complete <id>` | 完成会话         |
| `cancel <id>`   | 取消会话         |
| `status <id>`   | 查询会话状态     |

### 配置命令

```bash
grilling-sleek config set server http://localhost:3000  # Set server URL
grilling-sleek config get server                        # Get config value
grilling-sleek config list                              # List all configs
grilling-sleek config unset server                      # Remove config
```

## Usage Examples

### 创建会话

```bash
# Pass JSON via stdin
echo '{"name":"Architecture Review","questions":[...]}' | grilling-sleek create --json url

# Pass via file
grilling-sleek create --file questions.json --json url
```

### 等待答案

```bash
# Wait for user to submit answers, timeout 600 seconds
grilling-sleek poll <session-id> --wait 600
```

### 推送下一轮

```bash
# Push new questions
echo '{"name":"Tech Stack","questions":[...]}' | grilling-sleek push <session-id>
```

## CLI Options

| 选项               | 说明                                |
| ------------------ | ----------------------------------- |
| `--file -\|<path>` | 从标准输入或文件读取输入            |
| `--inline <json>`  | 直接传入 JSON 字符串（仅限小数据）  |
| `--json [fields]`  | 以 JSON 格式输出，可选过滤字段      |
| `--wait <sec>`     | 轮询超时时间，单位为秒（默认：600） |
| `--round <n>`      | 轮询指定轮次                        |
| `--reason <enum>`  | 取消原因                            |
| `--detail <text>`  | 取消详情                            |

## Environment Variables

| 变量                              | 说明                                             |
| --------------------------------- | ------------------------------------------------ |
| `GRILLING_SLEEK_SERVER`           | 服务器地址（默认：https://grillingsleek.online） |
| `GRILLING_SLEEK_TIMEOUT`          | 请求超时时间，单位为秒                           |
| `GRILLING_SLEEK_LONGPOLL_TIMEOUT` | 长轮询超时时间，单位为秒                         |

## Development

### 本地开发

```bash
# Install dependencies
pnpm install

# Run in dev mode
pnpm dev

# Build
pnpm build

# Production build
pnpm build:prod

# Run tests
pnpm test

# Lint code
pnpm lint
```

## License

MIT © jukanntenn
