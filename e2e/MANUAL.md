# Grill-me-sleek Manual Test Operations Guide

English | [中文](./MANUAL.zh.md)

This document provides a complete manual testing guide that testers can follow step by step to verify system functionality. All commands can be copied and executed directly, without modifying any configuration.

## Table of Contents

1. [Environment Preparation](#environment-preparation)
2. [CLI Feature Testing](#cli-feature-testing)
3. [Web UI Interaction Testing](#web-ui-interaction-testing)
4. [Multi-round Q&A Workflow Testing](#multi-round-qa-workflow-testing)
5. [SSE Real-time Event Testing](#sse-real-time-event-testing)
6. [Error Handling Testing](#error-handling-testing)
7. [Internationalization and Theme Testing](#internationalization-and-theme-testing)
8. [Environment Cleanup](#environment-cleanup)

---

## Environment Preparation

### 1. Start the Test Environment

```bash
# 进入项目根目录
cd /home/alice/Workspace/grill-me-sleek

# 一条命令完成构建和启动
docker compose -f docker/docker-compose.local.yml up -d --build
```

**Notes**:

- The `--build` flag builds the image first (if needed), then starts the containers
- Both the frontend and backend builds happen inside the Docker image; no local build is required
- Make sure the latest source code is used

### 2. Wait for the Service to Become Ready

```bash
# 等待服务启动（约 15-20 秒）
sleep 15

# 持续检查健康状态，直到服务就绪
until curl -sfk https://localhost:8443/v1/healthz; do
    echo 'Waiting for service...'
    sleep 2
done

echo "✓ 服务已就绪"
```

### 3. Verify Style Loading

```bash
# 检查加载的 CSS 文件
curl -sk https://localhost:8443 | grep -o "style-[^\"]*\.css"

# 验证样式变量是否正确应用
curl -sk https://localhost:8443/assets/style-*.css | grep -o "\-\-spacing-[a-z0-9]*" | sort -u
```

**Expected result**:

- The latest CSS file is loaded (e.g. `style-Dj_Hi23q.css`)
- Contains all spacing variables: `--spacing-xxs`, `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`, `--spacing-2xl`, `--spacing-3xl`, `--spacing-4xl`, `--spacing-5xl`, `--spacing-6xl`, `--spacing-section`

### 4. Set CLI Environment Variables

```bash
# 设置 CLI 服务地址
export GRILLING_SLEEK_SERVER=https://localhost:8443
export GRILLING_SLEEK_HTTP_TIMEOUT=30
export GRILLING_SLEEK_LONGPOLL_HTTP_TIMEOUT=65

# 验证 CLI 可用性
cd /home/alice/Workspace/grill-me-sleek/cli
grilling-sleek --help
```

### 5. Prepare Test Data Files

```bash
# 基础单选题
cat > /tmp/basic-grilling.json << 'EOF'
{
  "name": "基础测试会话",
  "questions": [
    {
      "id": "q_auth",
      "header": "认证方式",
      "text": "我们应该使用哪种认证方式？",
      "type": "single",
      "options": [
        { "label": "JWT" },
        { "label": "Session Cookies" }
      ],
      "recommended": 0
    }
  ]
}
EOF

# 第二轮问题
cat > /tmp/round2-grilling.json << 'EOF'
{
  "name": "第二轮问题",
  "questions": [
    {
      "id": "q_db",
      "header": "数据库选择",
      "text": "应该使用哪个数据库？",
      "type": "single",
      "options": [
        { "label": "PostgreSQL" },
        { "label": "MySQL" },
        { "label": "MongoDB" }
      ],
      "recommended": 0
    }
  ]
}
EOF
```

---

## CLI Feature Testing

### 1. Create a Session

```bash
# 创建新会话
cd /home/alice/Workspace/grill-me-sleek/cli
SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 验证会话创建成功
echo "Session ID: $SESSION_ID"

# 保存会话 ID 到环境变量
export TEST_SESSION_ID=$SESSION_ID
export TEST_URL="https://localhost:8443/#$SESSION_ID"
```

**Expected result**:

- Outputs a session ID (UUID format)
- The session status is active

### 2. Query Session Status

```bash
# 查询会话状态
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $TEST_SESSION_ID --json=session_id,status,current_round,name

# 查询完整状态
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $TEST_SESSION_ID
```

**Expected result**:

- The status is active
- The current round is 1
- The name is `基础测试会话` (from the JSON fixture below)

### 3. Push a New Round

```bash
# 推送第二轮问题
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek push $TEST_SESSION_ID --json=round < /tmp/round2-grilling.json

# 验证轮次推送成功
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $TEST_SESSION_ID --json=current_round
```

**Expected result**:

- The round changes from 1 to 2
- The push succeeds (no error output)

### 4. Wait for the User's Response (Timeout)

```bash
# 等待用户响应（10 秒超时）
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek poll $TEST_SESSION_ID --wait 10

# 检查退出码
echo "Exit code: $?"
```

**Expected result**:

- The exit code is 75 (timeout)
- Outputs a timeout message

### 5. Complete a Session

```bash
# 完成会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek complete $TEST_SESSION_ID

# 验证会话完成
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $TEST_SESSION_ID --json=status
```

**Expected result**:

- The status becomes gone
- detail is completed

### 6. Cancel a Session

```bash
# 创建新会话用于取消测试
CANCEL_SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 取消会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek cancel $CANCEL_SESSION_ID --reason user_cancelled

# 验证会话取消
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $CANCEL_SESSION_ID --json=status,detail
```

**Expected result**:

- The status becomes gone
- detail is cancelled

### 7. Invalid JSON Handling (Exit Code 64)

```bash
# 尝试创建无效 JSON 的会话
echo "invalid json" | GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id

# 检查退出码
echo "Exit code: $?"
```

**Expected result**:

- The exit code is 64
- Outputs an error message

### 8. Invalid Schema Handling (Exit Code 64)

```bash
# 尝试创建无效 Schema 的会话
echo '{"invalid": "schema"}' | GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id

# 检查退出码
echo "Exit code: $?"
```

**Expected result**:

- The exit code is 64
- Outputs an error message

### 9. Non-existent Session Handling (Exit Code 1)

```bash
# 尝试查询不存在的会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status "non-existent-session-id"

# 检查退出码
echo "Exit code: $?"
```

**Expected result**:

- The exit code is 1
- Outputs an error message

### 10. Invalid Cancel Reason Handling (Exit Code 64)

```bash
# 尝试使用无效原因取消会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek cancel $CANCEL_SESSION_ID --reason invalid_reason

# 检查退出码
echo "Exit code: $?"
```

**Expected result**:

- The exit code is 64
- Outputs an error message

---

## Web UI Interaction Testing

### 1. Page Loading

```bash
# 打开浏览器访问测试 URL
echo "请打开浏览器访问: $TEST_URL"

# 或者使用命令行验证页面加载
curl -s $TEST_URL | grep -o "<title>.*</title>"
```

**Expected result**:

- The page loads normally
- The title is "Grilling"

### 2. Single-choice Question Interaction

```bash
# 验证单选题渲染
curl -s $TEST_URL | grep -o "q_auth"

# 验证选项渲染
curl -s $TEST_URL | grep -o "JWT"
curl -s $TEST_URL | grep -o "Session Cookies"
```

**Expected result**:

- The single-choice question renders correctly
- The options are displayed correctly

### 3. Submission Success Feedback

```bash
# 验证提交按钮存在
curl -s $TEST_URL | grep -o "submit"

# 验证表单结构
curl -s $TEST_URL | grep -o "<form"
```

**Expected result**:

- The submit button exists
- The form structure is correct

---

## Multi-round Q&A Workflow Testing

### 1. First-round Answers

```bash
# 创建新会话用于多轮测试
MULTI_SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')
export MULTI_SESSION_ID
export MULTI_URL="https://localhost:8443/#$MULTI_SESSION_ID"

# 推送第二轮问题
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek push $MULTI_SESSION_ID --json=round < /tmp/round2-grilling.json

# 验证轮次变化
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $MULTI_SESSION_ID --json=current_round
```

**Expected result**:

- The round changes from 1 to 2
- The push succeeds

### 2. Second-round Auto Loading

```bash
# 打开浏览器访问第二轮 URL
echo "请打开浏览器访问: $MULTI_URL"

# 验证第二轮问题加载
curl -s $MULTI_URL | grep -o "q_db"
```

**Expected result**:

- The second-round questions load automatically
- The question ID is q_db

### 3. Session Completion

```bash
# 完成会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek complete $MULTI_SESSION_ID

# 验证会话完成
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $MULTI_SESSION_ID --json=status,detail
```

**Expected result**:

- The status becomes gone
- detail is completed

### 4. Session Cancellation

```bash
# 创建新会话用于取消测试
CANCEL_MULTI_SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 取消会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek cancel $CANCEL_MULTI_SESSION_ID --reason user_cancelled

# 验证会话取消
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $CANCEL_MULTI_SESSION_ID --json=status,detail
```

**Expected result**:

- The status becomes gone
- detail is cancelled

---

## SSE Real-time Event Testing

### 1. Round Created Event

```bash
# 创建新会话用于 SSE 测试
SSE_SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 监听 SSE 事件（后台运行）
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek poll $SSE_SESSION_ID --wait 30 &
POLL_PID=$!

# 推送新轮次
sleep 2
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek push $SSE_SESSION_ID --json=round < /tmp/round2-grilling.json

# 等待事件
wait $POLL_PID
echo "Exit code: $?"
```

**Expected result**:

- The round-created event is received
- The exit code is 0

### 2. Session Completed Event

```bash
# 创建新会话用于完成事件测试
COMPLETE_SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 监听 SSE 事件（后台运行）
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek poll $COMPLETE_SESSION_ID --wait 30 &
POLL_PID=$!

# 完成会话
sleep 2
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek complete $COMPLETE_SESSION_ID

# 等待事件
wait $POLL_PID
echo "Exit code: $?"
```

**Expected result**:

- The session-completed event is received
- The exit code is 0

### 3. Session Cancelled Event

```bash
# 创建新会话用于取消事件测试
CANCEL_SSE_SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 监听 SSE 事件（后台运行）
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek poll $CANCEL_SSE_SESSION_ID --wait 30 &
POLL_PID=$!

# 取消会话
sleep 2
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek cancel $CANCEL_SSE_SESSION_ID --reason user_cancelled

# 等待事件
wait $POLL_PID
echo "Exit code: $?"
```

**Expected result**:

- The session-cancelled event is received
- The exit code is 0

---

## Error Handling Testing

### 1. Invalid Session ID

```bash
# 尝试查询无效会话 ID
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status "invalid-session-id"

# 检查退出码
echo "Exit code: $?"
```

**Expected result**:

- The exit code is 1
- Outputs an error message

### 2. Non-existent Session

```bash
# 尝试查询不存在的会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status "00000000-0000-0000-0000-000000000000"

# 检查退出码
echo "Exit code: $?"
```

**Expected result**:

- The exit code is 1
- Outputs an error message

---

## Internationalization and Theme Testing

### 1. Theme Switching

```bash
# 打开浏览器访问测试 URL
echo "请打开浏览器访问: $TEST_URL"

# 切换主题（在浏览器中操作）
# 1. 点击右上角的主题切换按钮
# 2. 选择 "Dark" 主题
# 3. 验证页面背景变为深色
# 4. 切换回 "Light" 主题
# 5. 验证页面背景变为浅色
```

**Expected result**:

- Theme switching works properly
- The page styles update correctly

### 2. Language Switching

```bash
# 打开浏览器访问测试 URL
echo "请打开浏览器访问: $TEST_URL"

# 切换语言（在浏览器中操作）
# 1. 点击右上角的语言切换按钮
# 2. 选择 "English" 语言
# 3. 验证页面文本变为英文
# 4. 切换回 "中文" 语言
# 5. 验证页面文本变为中文
```

**Expected result**:

- Language switching works properly
- The page text updates correctly

---

## Environment Cleanup

### 1. Stop the Docker Containers

```bash
# 停止并删除容器
cd /home/alice/Workspace/grill-me-sleek
docker compose -f docker/docker-compose.local.yml down
```

### 2. Clean Up Temporary Files

```bash
# 删除测试数据文件
rm -f /tmp/basic-grilling.json
rm -f /tmp/round2-grilling.json

# 清理环境变量
unset TEST_SESSION_ID TEST_URL
unset CANCEL_SESSION_ID
unset MULTI_SESSION_ID MULTI_URL
unset SSE_CANCEL_ID

echo "✓ 环境已清理"
```

---

## Test Checklist

### CLI Testing

- [ ] Create a session
- [ ] Query session status
- [ ] Push a new round
- [ ] Wait for the user's response (timeout)
- [ ] Complete a session
- [ ] Cancel a session
- [ ] Invalid JSON handling (exit code 64)
- [ ] Invalid Schema handling (exit code 64)
- [ ] Non-existent session handling (exit code 1)
- [ ] Invalid cancel reason handling (exit code 64)

### Web UI Testing

- [ ] Page loading
- [ ] Single-choice question interaction
- [ ] Submission success feedback

### Multi-round Workflow

- [ ] First-round answers
- [ ] Second-round auto loading
- [ ] Session completion
- [ ] Session cancellation

### SSE Events

- [ ] Round created event
- [ ] Session completed event
- [ ] Session cancelled event

### Error Handling

- [ ] Invalid session ID
- [ ] Non-existent session

### Internationalization and Theme

- [ ] Theme switching
- [ ] Language switching

---

## Common Commands Quick Reference

```bash
# 设置环境变量
export GRILLING_SLEEK_SERVER=https://localhost:8443

# 创建会话并保存 ID
export SESSION_ID=$(GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek create --json=session_id < grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 查询状态
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek status $SESSION_ID --json=session_id,status,current_round,name

# 推送轮次
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek push $SESSION_ID --json=round < grilling.json

# 等待响应
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek poll $SESSION_ID --wait 60

# 完成会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek complete $SESSION_ID

# 取消会话
GRILLING_SLEEK_SERVER=https://localhost:8443 grilling-sleek cancel $SESSION_ID --reason user_cancelled
```

## Exit Code Reference

| Exit Code | Meaning                                             |
| --------- | --------------------------------------------------- |
| 0         | Success                                             |
| 1         | General error (API error, network error)            |
| 64        | Command-line usage error / input validation failure |
| 75        | Wait timed out                                      |
| 76        | Session expired                                     |

## Available Fields for the status Command

| Field           | Description                                      |
| --------------- | ------------------------------------------------ |
| `session_id`    | Session ID                                       |
| `status`        | Status (active/gone)                             |
| `current_round` | Current round                                    |
| `name`          | Session name                                     |
| `created_at`    | Creation time                                    |
| `expires_at`    | Expiration time                                  |
| `detail`        | Details (when gone: completed/cancelled/expired) |

---

## E2E Environment Conventions

### Docker Build Conventions

#### 1. Build Command

```bash
# 一条命令完成构建和启动
docker compose -f ../docker/docker-compose.local.yml up -d --build
```

#### 2. Build Process

1. **Build the image**: Docker builds the frontend and backend inside the container
2. **Create the network**: create the Docker network
3. **Create the containers**: create the Docker containers
4. **Start the containers**: start the Docker containers

#### 3. Design Principles

- **Consistency**: all builds happen inside Docker, ensuring a consistent environment
- **Simplicity**: developers do not need to worry about the local environment; they only need to modify code and build the image
- **Reliability**: avoids problems caused by local environment differences

### File Conventions

#### 1. The `.dockerignore` File

```dockerignore
# Node — frontend is built inside Docker (no host node_modules or dist needed)
node_modules/
web/dist/
```

**Notes**:

- Excludes `node_modules/` and `web/dist/`
- Ensures Docker builds the frontend inside the container
- Avoids problems caused by local environment differences

#### 2. The `docker/docker-compose.local.yml` File

```yaml
# e2e 和本地验收环境配置
# 自签名 HTTPS，端口 8443，不需要数据持久化

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
    healthcheck:
      test: ["CMD", "curl", "-fsk", "https://localhost:8443/v1/healthz"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
```

**Notes**:

- Uses `context: ..` to point to the project root directory
- Uses `dockerfile: docker/Dockerfile` to point to the Dockerfile
- Maps port 8443 (HTTPS)
- No data persistence needed (data is stored in the container's temporary directory)
- Mounts the Caddy configuration file
- Configures a health check

### Development Workflow Conventions

#### 1. After Modifying Styles

```bash
# 1. 修改样式文件
vim web/src/styles/globals.css

# 2. 一条命令完成构建和启动
cd /home/alice/Workspace/grill-me-sleek && docker compose -f docker/docker-compose.local.yml up -d --build

# 3. 验证样式
curl -sk https://localhost:8443 | grep style
```

#### 2. After Modifying Rust Code

```bash
# 1. 修改 Rust 代码
vim server/src/main.rs

# 2. 一条命令完成构建和启动
cd /home/alice/Workspace/grill-me-sleek && docker compose -f docker/docker-compose.local.yml up -d --build

# 3. 验证功能
curl -sk https://localhost:8443/v1/healthz
```

#### 3. After Modifying Frontend Code

```bash
# 1. 修改前端代码
vim web/src/components/QuestionCard.tsx

# 2. 一条命令完成构建和启动
cd /home/alice/Workspace/grill-me-sleek && docker compose -f docker/docker-compose.local.yml up -d --build

# 3. 验证功能
curl -sk https://localhost:8443 | grep QuestionCard
```

### Verification Conventions

#### 1. Verify Container Status

```bash
# 查看容器状态
docker compose -f ../docker/docker-compose.local.yml ps

# 预期结果：
# NAME        IMAGE     COMMAND   SERVICE   CREATED          STATUS                    PORTS
# grilling-sleek   grilling-sleek   "/init"   grilling-sleek   16 seconds ago   Up 15 seconds (healthy)   0.0.0.0:8443->8443/tcp, [::]:8443->8443/tcp
```

#### 2. Verify Style Loading

```bash
# 检查加载的 CSS 文件
curl -sk https://localhost:8443 | grep -o "style-[^\"]*\.css"

# 验证样式变量是否正确应用
curl -sk https://localhost:8443/assets/style-*.css | grep -o "\-\-spacing-[a-z0-9]*" | sort -u

# 预期结果：
# --spacing-xxs
# --spacing-xs
# --spacing-sm
# --spacing-md
# --spacing-lg
# --spacing-xl
# --spacing-2xl
# --spacing-3xl
# --spacing-4xl
# --spacing-5xl
# --spacing-6xl
# --spacing-section
```

#### 3. Verify the Health Check

```bash
# 检查健康状态
curl -sk https://localhost:8443/v1/healthz

# 预期结果：
# ok
```

### Troubleshooting

#### 1. Build Failure

```bash
# 查看构建日志
docker compose -f ../docker/docker-compose.local.yml build --no-cache

# 查看容器日志
docker compose -f ../docker/docker-compose.local.yml logs -f
```

#### 2. Container Fails to Start

```bash
# 检查容器状态
docker compose -f ../docker/docker-compose.local.yml ps

# 查看容器日志
docker compose -f ../docker/docker-compose.local.yml logs -f

# 检查端口占用
lsof -i :8443
```

#### 3. Styles Not Updated

```bash
# 强制重新构建
docker compose -f ../docker/docker-compose.local.yml build --no-cache

# 重启容器
docker compose -f ../docker/docker-compose.local.yml up -d --build

# 验证样式
curl -sk https://localhost:8443 | grep style
```

---

## Best Practices

### 1. Development Workflow

- After modifying code, use `docker compose up -d --build` to build and start with a single command
- Verify that styles and functionality are working properly
- Use `docker compose logs -f` to view logs

### 2. Testing Workflow

- Verify items one by one following the test checklist
- Record test results and issues
- Clean up the test environment promptly

### 3. Troubleshooting

- Check container status and logs first
- Verify style loading and the health check
- Use the troubleshooting guide to resolve issues
