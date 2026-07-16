# @grilling-sleek/cli

CLI tool for grilling-sleek - Stress-test your plan before vibe coding.

## Features

- 🎯 **Interactive Q&A**: AI generates questions to stress-test your plan
- 🌐 **Web UI**: Review and answer questions in a sleek browser interface
- 🔄 **Multi-round Iteration**: Automatic multi-round Q&A until consensus
- 📊 **JSON Schema Validation**: Ensures Q&A data format correctness
- 🔌 **API Integration**: Seamless communication with grilling-sleek Hub

## Installation

### Install via npm (Recommended)

```bash
npm install -g @grilling-sleek/cli
```

For users experiencing network issues, use npm mirror for faster installation:

```bash
npm install -g @grilling-sleek/cli --registry https://registry.npmmirror.com
```

Update:

```bash
npm update -g @grilling-sleek/cli
```

### Build from Source

```bash
git clone https://github.com/jukanntenn/grill-me-sleek.git
cd grill-me-sleek/cli
pnpm install
pnpm build
```

## Commands

### Basic Commands

| Command | Description |
|---------|-------------|
| `create` | Create a new Q&A session |
| `poll <id>` | Wait for user to submit answers |
| `push <id>` | Push next round of questions |
| `complete <id>` | Complete session |
| `cancel <id>` | Cancel session |
| `status <id>` | Query session status |

### Configuration Commands

```bash
grilling-sleek config set server http://localhost:3000  # Set server URL
grilling-sleek config get server                        # Get config value
grilling-sleek config list                              # List all configs
grilling-sleek config unset server                      # Remove config
```

## Usage Examples

### Create Session

```bash
# Pass JSON via stdin
echo '{"name":"Architecture Review","questions":[...]}' | grilling-sleek create --json url

# Pass via file
grilling-sleek create --file questions.json --json url
```

### Poll for Answers

```bash
# Wait for user to submit answers, timeout 600 seconds
grilling-sleek poll <session-id> --wait 600
```

### Push Next Round

```bash
# Push new questions
echo '{"name":"Tech Stack","questions":[...]}' | grilling-sleek push <session-id>
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--file -\|<path>` | Read input from stdin or file |
| `--inline <json>` | Pass JSON string directly (small data only) |
| `--json [fields]` | Output in JSON format, optional field filter |
| `--wait <sec>` | Poll timeout in seconds (default: 600) |
| `--round <n>` | Poll specific round |
| `--reason <enum>` | Cancel reason |
| `--detail <text>` | Cancel details |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GRILLING_SLEEK_SERVER` | Server URL (default: https://grillingsleek.online) |
| `GRILLING_SLEEK_TIMEOUT` | Request timeout in seconds |
| `GRILLING_SLEEK_LONGPOLL_TIMEOUT` | Long poll timeout in seconds |

## Development

### Local Development

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
