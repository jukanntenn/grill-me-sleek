# E2E 测试规范

## 1. 概述

### 1.1 目标

- 覆盖所有核心业务场景和边界情况
- 验证前后端完整集成（真实环境，不使用 mock）
- 确保新功能不引入回归 BUG
- 测试环境尽可能接近生产环境

### 1.2 设计原则

借鉴知名开源项目的测试策略：

| 项目 | 策略 | 我们的应用 |
|------|------|-----------|
| obsidian-livesync | CLI 驱动 + Docker 容器 + 临时目录隔离 | cli/ 驱动数据交互，Docker Compose 启动完整环境 |
| airflow | 真实 API + Page Object Model + Fixtures 管理 | cli/ 命令准备数据，Playwright 验证 UI |

**核心理念**：真实环境端对端测试，不使用 mock。

### 1.3 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 测试框架 | Playwright | 现代浏览器自动化，支持多浏览器 |
| 测试运行器 | Node.js + TypeScript | 与前端技术栈一致 |
| 数据交互 | cli/ 命令 | 真实环境 agent 使用的工具 |
| 环境管理 | Docker Compose | 接近生产环境 |
| 包管理器 | pnpm | 与项目其他部分一致 |

## 2. 测试架构

### 2.1 整体架构

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

### 2.2 目录结构

```
e2e/
├── docker-compose.e2e.yml        # Docker 环境配置
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

## 3. 测试执行

### 3.1 一键执行（推荐）

只需一条命令，自动完成：构建镜像 → 启动容器 → 运行测试 → 清理环境

```bash
cd e2e && pnpm test
```

### 3.2 分步执行

如果需要调试或只运行部分测试：

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

### 3.3 调试模式

```bash
# 打开浏览器窗口，逐步执行
pnpm run test:debug

# 显示浏览器窗口
pnpm run test:headed

# 查看容器日志
pnpm run docker:logs
```

### 3.4 CI/CD 集成

在 CI 环境中，使用与本地相同的命令：

```yaml
# .github/workflows/e2e.yml
- name: Run E2E tests
  run: cd e2e && pnpm test
```

### 3.5 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GS_SERVER` | `http://localhost:8443` | 后端服务器地址 |
| `BASE_URL` | `http://localhost:8443` | Playwright 测试基础 URL |
| `CI` | - | CI 环境标识（影响重试和并行度） |

### 3.6 前置条件

- Docker 和 Docker Compose
- Node.js 22+
- pnpm（项目统一使用）
- 网络访问（首次构建需要下载依赖）

### 3.7 故障排除

**Docker 构建失败**
```bash
# 查看构建日志
cd e2e && pnpm run docker:logs

# 清理并重新构建
pnpm run docker:down && pnpm run docker:up
```

**测试超时**
```bash
# 增加超时时间
pnpm test -- --timeout=60000
```

**容器启动失败**
```bash
# 检查端口占用
lsof -i :8443
lsof -i :8080

# 强制清理
docker compose -f docker-compose.e2e.yml down -v --remove-orphans
```

## 4. 核心组件设计

### 4.1 cli/ 命令封装

所有数据交互都通过 cli/ 命令，与真实 agent 行为一致。

```typescript
// e2e/utils/cli.ts
export async function createSession(name: string, grillingJson: string): Promise<CreateSessionResult> {
  const { data } = await expectCliSuccess<CreateSessionResult>(
    ['create', '--json=session_id,url,status,current_round,name,created_at,expires_at'],
    grillingJson
  );
  return data;
}
```

### 4.2 Page Object Model

每个页面封装为一个类，提供稳定的接口。

```typescript
// e2e/pages/QuestionsPage.ts
export class QuestionsPage extends BasePage {
  readonly submitButton: Locator;

  async submit() {
    await this.submitButton.click();
  }

  async waitForSubmitSuccess() {
    await expect(this.page.getByText('Waiting for the next round')).toBeVisible();
  }
}
```

### 4.3 Fixtures 管理

使用 Playwright 的 fixtures 管理测试数据和页面对象。

```typescript
// e2e/fixtures/data.ts
export const test = base.extend<DataFixtures>({
  basicSession: [
    async ({}, use) => {
      const session = await createSession('Test', grillingJson);
      await use({ session, grillingJson });
    },
    { scope: 'test' },
  ],
});
```

## 5. 测试用例覆盖

### 5.1 CLI 行为测试 (cli-behavior.spec.ts)

| 测试 | 说明 |
|------|------|
| create 命令 > 成功创建会话 | 验证返回值结构 |
| create 命令 > 无效 JSON 输入 | 验证错误码 64 |
| create 命令 > Schema 验证失败 | 验证错误码 64 |
| create 命令 > 重复问题 ID | 验证错误码 64 |
| push 命令 > 成功推送新轮次 | 验证返回值 |
| push 命令 > 不存在的会话 | 验证错误码 1 |
| poll 命令 > 超时 | 验证退出码 75 |
| poll 命令 > 会话取消 | 验证错误信息 |
| status 命令 > 查询活跃会话 | 验证返回值 |
| status 命令 > 查询已完成会话 | 验证状态 |
| status 命令 > 查询已取消会话 | 验证状态 |
| status 命令 > 查询不存在的会话 | 验证错误码 1 |
| complete 命令 > 成功完成会话 | 验证状态变更 |
| cancel 命令 > 成功取消会话 | 验证状态变更 |
| cancel 命令 > 无效的取消原因 | 验证错误码 64 |

### 5.2 会话生命周期测试 (session-lifecycle.spec.ts)

| 测试 | 说明 |
|------|------|
| 完整流程 | 创建 → 答题 → 多轮 → 完成 |
| 用户取消 | 验证取消页面 |
| 会话完成 | 验证完成页面 |
| 查询会话状态 | 验证 API 返回值 |
| 多轮问答流程 | 验证轮次切换 |

### 5.3 待实现的测试

- 多轮问答测试 (multi-round.spec.ts)
- 用户交互测试 (user-interaction.spec.ts)
- 错误处理测试 (error-handling.spec.ts)
- SSE 事件流测试 (sse.spec.ts)
- 边界情况测试 (edge-cases.spec.ts)

## 6. Docker 配置

### 6.1 docker-compose.e2e.yml

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "8443:8443"
      - "8080:8080"
    environment:
      - GSLEEK_BASE_URL=http://localhost:8443
      - GSLEEK_DB_PATH=/app/data/e2e-test.db
      - RUST_LOG=info
    volumes:
      - e2e-data:/app/data
      - ./Caddyfile:/app/Caddyfile:ro
```

### 6.2 Caddyfile（E2E 专用）

```
{
    auto_https off
}

:8443 {
    root * /app/web/dist
    file_server

    reverse_proxy /v1/* 127.0.0.1:8080 {
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

## 7. 最佳实践

### 7.1 测试编写

1. **独立性**：每个测试用例独立运行
2. **可读性**：使用描述性名称
3. **稳定性**：使用自动等待，避免硬编码等待

### 7.2 数据管理

1. **cli/ 驱动**：所有数据交互通过 cli/ 命令
2. **Fixtures 隔离**：每个测试用例独立数据
3. **自动清理**：测试结束后自动清理

### 7.3 调试技巧

1. **查看测试报告**：`pnpm run report`
2. **调试模式**：`pnpm run test:debug`
3. **查看容器日志**：`pnpm run docker:logs`
