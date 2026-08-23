# E2E testing spec

English | [中文](e2e.zh.md)

## 1. Overview

### 1.1 Goals

- Cover every core business scenario and boundary case
- Verify full frontend/backend integration (real environment, no mocks)
- Keep new features from introducing regressions
- Keep the test environment as close to production as possible

### 1.2 Design principles

Borrowed from well-known open-source testing strategies:

| Project           | Strategy                                            | Our application                                                              |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| obsidian-livesync | CLI-driven + Docker containers + temp-dir isolation | cli/ drives data interactions; Docker Compose brings up the full environment |
| airflow           | Real API + Page Object Model + fixture management   | cli/ commands prepare data; Playwright verifies the UI                       |

**Core idea**: real-environment end-to-end testing, no mocks.

### 1.3 Technology choices

| Component        | Choice               | Why                                      |
| ---------------- | -------------------- | ---------------------------------------- |
| Test framework   | Playwright           | Modern browser automation, multi-browser |
| Test runner      | Node.js + TypeScript | Matches the frontend stack               |
| Data interaction | cli/ commands        | The tool real agents use                 |
| Environment      | Docker Compose       | Close to production                      |
| Package manager  | pnpm                 | Consistent with the rest of the project  |

## 2. Test architecture

### 2.1 Overall architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Playwright Test Runner                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ 浏览器测试  │  │  cli/ 命令  │  │  Fixtures   │        │
│  │  (UI 交互)  │  │ (数据准备)  │  │ (数据管理)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│         ↓                ↓                ↓                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Docker Compose (完整环境)                  │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │  Caddy  │  │  Rust   │  │ SQLite  │            │   │
│  │  │  :8443  │→ │  Server │→ │ (数据)  │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘            │   │
│  │       ↑                                            │   │
│  │       │                                            │   │
│  │  ┌─────────┐                                       │   │
│  │  │Frontend │                                       │   │
│  │  │(静态)   │                                       │   │
│  │  └─────────┘                                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Directory layout

```
e2e/
├── docker-compose.local.yml        # Docker 环境配置
├── Caddyfile                      # Caddy 配置（无 TLS）
├── package.json                   # 测试依赖和脚本
├── playwright.config.ts           # Playwright 配置
├── tsconfig.json                  # TypeScript 配置
├── fixtures/                      # 测试夹具
│   ├── data.ts                   # 数据 fixtures
│   ├── index.ts                  # 统一导出
│   └── pom.ts                    # Page Object fixtures
├── pages/                         # Page Object Model
│   ├── BasePage.ts               # 基础页面类
│   ├── Controls.ts               # 控制组件
│   ├── QuestionsPage.ts          # 问题页面
│   └── TerminalPage.ts           # 终态页面
├── specs/                         # 测试用例
│   ├── cli-behavior.spec.ts      # cli/ 命令行为测试
│   ├── session-lifecycle.spec.ts # 会话生命周期测试
│   └── ...                       # 其他测试
└── utils/                         # 工具函数
    ├── cli.ts                    # cli/ 命令封装
    ├── db.ts                     # 数据库操作
    └── shared.ts                 # 共享工具
```

## 3. Running the tests

### 3.1 One command (recommended)

A single command does: build images → start containers → run tests → tear down

```bash
cd e2e && pnpm test
```

### 3.2 Step by step

For debugging or partial runs:

```bash
# 1. 启动 Docker 环境（自动构建镜像）
cd e2e && pnpm run docker:up

# 2. 运行测试
pnpm test                              # 运行所有测试
pnpm run test:cli                      # 只运行 CLI 行为测试
pnpm run test:lifecycle                # 只运行会话生命周期测试
pnpm test -- specs/sse.spec.ts         # 运行指定测试文件
pnpm test -- --grep "超时"             # 运行匹配名称的测试

# 3. 查看测试报告
pnpm run report

# 4. 停止并清理 Docker 环境
pnpm run docker:down
```

### 3.3 Debug modes

```bash
# 打开浏览器窗口，逐步执行
pnpm run test:debug

# 显示浏览器窗口
pnpm run test:headed

# 查看容器日志
pnpm run docker:logs
```

### 3.4 CI integration

CI uses the same commands as local:

```yaml
# .github/workflows/e2e.yml
- name: Run E2E tests
  run: cd e2e && pnpm test
```

### 3.5 Environment variables

| Variable    | Default                 | Purpose                                     |
| ----------- | ----------------------- | ------------------------------------------- |
| `GS_SERVER` | `http://localhost:8443` | Backend server address                      |
| `BASE_URL`  | `http://localhost:8443` | Playwright base URL                         |
| `CI`        | -                       | CI marker (affects retries and parallelism) |

### 3.6 Prerequisites

- Docker and Docker Compose
- Node.js 22+
- pnpm (as everywhere in the project)
- Network access (first build downloads dependencies)

### 3.7 Troubleshooting

**Docker build fails**

```bash
# 查看构建日志
cd e2e && pnpm run docker:logs

# 清理并重新构建
pnpm run docker:down && pnpm run docker:up
```

**Test timeouts**

```bash
# 增加超时时间
pnpm test -- --timeout=60000
```

**Container fails to start**

```bash
# 检查端口占用
lsof -i :8443

# 强制清理
docker compose -f docker-compose.local.yml down -v --remove-orphans
```

## 4. Core component design

### 4.1 cli/ command wrappers

All data interaction goes through cli/ commands, matching real agent behavior.

```typescript
// e2e/utils/cli.ts
export async function createSession(
  name: string,
  grillingJson: string,
): Promise<CreateSessionResult> {
  const { data } = await expectCliSuccess<CreateSessionResult>(
    ["create", "--json=session_id,url,status,current_round,name,created_at,expires_at"],
    grillingJson,
  );
  return data;
}
```

### 4.2 Page Object Model

Each page is wrapped in a class exposing a stable interface.

```typescript
// e2e/pages/QuestionsPage.ts
export class QuestionsPage extends BasePage {
  readonly submitButton: Locator;

  async submit() {
    await this.submitButton.click();
  }

  async waitForSubmitSuccess() {
    await expect(this.page.getByText("Waiting for the next round")).toBeVisible();
  }
}
```

### 4.3 Fixture management

Playwright fixtures manage test data and page objects.

```typescript
// e2e/fixtures/data.ts
export const test = base.extend<DataFixtures>({
  basicSession: [
    async ({}, use) => {
      const session = await createSession("Test", grillingJson);
      await use({ session, grillingJson });
    },
    { scope: "test" },
  ],
});
```

## 5. Test coverage

### 5.1 CLI behavior tests (cli-behavior.spec.ts)

| Test                                       | Verifies          |
| ------------------------------------------ | ----------------- |
| create command > session created           | Return structure  |
| create command > invalid JSON input        | Exit code 64      |
| create command > schema validation failure | Exit code 64      |
| create command > duplicate question ids    | Exit code 64      |
| push command > new round pushed            | Return value      |
| push command > nonexistent session         | Exit code 1       |
| poll command > timeout                     | Exit code 75      |
| poll command > session cancelled           | Error message     |
| status command > active session            | Return value      |
| status command > completed session         | Status            |
| status command > cancelled session         | Status            |
| status command > nonexistent session       | Exit code 1       |
| complete command > session completed       | Status transition |
| cancel command > session cancelled         | Status transition |
| cancel command > invalid cancel reason     | Exit code 64      |

### 5.2 Session lifecycle tests (session-lifecycle.spec.ts)

| Test                 | Verifies                                     |
| -------------------- | -------------------------------------------- |
| Full flow            | Create → answer → multiple rounds → complete |
| User cancellation    | Cancellation page                            |
| Session completion   | Completion page                              |
| Session status query | API return value                             |
| Multi-round Q&A flow | Round transitions                            |

### 5.3 Tests still to build

- Multi-round Q&A tests (multi-round.spec.ts)
- User-interaction tests (user-interaction.spec.ts)
- Error-handling tests (error-handling.spec.ts)
- SSE event-stream tests (sse.spec.ts)
- Edge-case tests (edge-cases.spec.ts)

## 6. Docker configuration

### 6.1 docker-compose.local.yml

```yaml
services:
  grilling-sleek:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "8443:8443"
    environment:
      - GSLEEK_BASE_URL=https://localhost:8443
      - GSLEEK_DB_PATH=/app/data/grilling-sleek.db
      - GSLEEK_DISABLE_RATE_LIMIT=true
      - RUST_LOG=info
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
    volumes:
      - ./Caddyfile.local:/app/Caddyfile:ro
```

### 6.2 Caddyfile.local (for E2E / local acceptance)

```
{
    local_certs
}

localhost:8443 {
    tls internal

    root * /app/web/dist
    file_server

    reverse_proxy /v1/* 127.0.0.1:8000 {
        transport http {
            versions h2c
        }
        health_uri      /v1/healthz
        health_interval 10s
        health_timeout  2s
        flush_interval  -1
    }
}
```

## 7. Best practices

### 7.1 Writing tests

1. **Independence**: every test case runs on its own
2. **Readability**: descriptive names
3. **Stability**: auto-waiting, never hardcoded sleeps

### 7.2 Data management

1. **cli/-driven**: all data interaction through cli/ commands
2. **Fixture isolation**: each test case has its own data
3. **Automatic cleanup**: teardown after every test

### 7.3 Debugging tips

1. **Test report**: `pnpm run report`
2. **Debug mode**: `pnpm run test:debug`
3. **Container logs**: `pnpm run docker:logs`
