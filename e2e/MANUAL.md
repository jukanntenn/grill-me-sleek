# Grill-me-sleek 手动测试操作手册

本文档提供完整的手动测试指南，测试人员可以按照步骤逐一验证系统功能。所有命令均可直接复制执行，无需修改任何配置。

## 目录

1. [环境准备](#环境准备)
2. [CLI 功能测试](#cli-功能测试)
3. [Web UI 交互测试](#web-ui-交互测试)
4. [多轮问答流程测试](#多轮问答流程测试)
5. [SSE 实时事件测试](#sse-实时事件测试)
6. [错误处理测试](#错误处理测试)
7. [国际化与主题测试](#国际化与主题测试)
8. [清理环境](#清理环境)

---

## 环境准备

### 1. 启动测试环境

```bash
# 进入 e2e 测试目录
cd /home/alice/Workspace/grill-me-sleek/e2e

# 一条命令完成构建和启动
docker compose -f docker-compose.e2e.yml up -d --build
```

**说明**：
- `--build` 参数会先构建镜像（如果需要），然后启动容器
- 前后端构建都在 Docker 镜像内完成，无需本地构建
- 确保使用最新的源代码

### 2. 等待服务就绪

```bash
# 等待服务启动（约 15-20 秒）
sleep 15

# 持续检查健康状态，直到服务就绪
until curl -sf http://localhost:8443/v1/healthz; do
    echo 'Waiting for service...'
    sleep 2
done

echo "✓ 服务已就绪"
```

### 3. 验证样式加载

```bash
# 检查加载的 CSS 文件
curl -s http://localhost:8443 | grep -o "style-[^\"]*\.css"

# 验证样式变量是否正确应用
curl -s http://localhost:8443/assets/style-*.css | grep -o "\-\-spacing-[a-z0-9]*" | sort -u
```

**预期结果**：
- 加载最新的 CSS 文件（如 `style-Dj_Hi23q.css`）
- 包含所有 spacing 变量：`--spacing-xxs`, `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`, `--spacing-2xl`, `--spacing-3xl`, `--spacing-4xl`, `--spacing-5xl`, `--spacing-6xl`, `--spacing-section`

### 4. 设置 CLI 环境变量

```bash
# 设置 CLI 服务地址
export GS_SERVER=http://localhost:8443
export GS_HTTP_TIMEOUT=30
export GS_LONGPOLL_HTTP_TIMEOUT=65

# 验证 CLI 可用性
cd /home/alice/Workspace/grill-me-sleek/cli
node dist/grill.js --help
```

### 5. 准备测试数据文件

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

## CLI 功能测试

### 1. 创建会话

```bash
# 创建新会话
cd /home/alice/Workspace/grill-me-sleek/cli
SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 验证会话创建成功
echo "Session ID: $SESSION_ID"

# 保存会话 ID 到环境变量
export TEST_SESSION_ID=$SESSION_ID
export TEST_URL="http://localhost:8443/#$SESSION_ID"
```

**预期结果**：
- 输出会话 ID（UUID 格式）
- 会话状态为 active

### 2. 查询会话状态

```bash
# 查询会话状态
GS_SERVER=http://localhost:8443 node dist/grill.js status $TEST_SESSION_ID --json=session_id,status,current_round,name

# 查询完整状态
GS_SERVER=http://localhost:8443 node dist/grill.js status $TEST_SESSION_ID
```

**预期结果**：
- 状态为 active
- 当前轮次为 1
- 名称为 "基础测试会话"

### 3. 推送新轮次

```bash
# 推送第二轮问题
GS_SERVER=http://localhost:8443 node dist/grill.js push $TEST_SESSION_ID --json=round < /tmp/round2-grilling.json

# 验证轮次推送成功
GS_SERVER=http://localhost:8443 node dist/grill.js status $TEST_SESSION_ID --json=current_round
```

**预期结果**：
- 轮次从 1 变为 2
- 推送成功（无错误输出）

### 4. 等待用户响应（超时）

```bash
# 等待用户响应（10 秒超时）
GS_SERVER=http://localhost:8443 node dist/grill.js poll $TEST_SESSION_ID --wait 10

# 检查退出码
echo "Exit code: $?"
```

**预期结果**：
- 退出码为 75（超时）
- 输出超时信息

### 5. 完成会话

```bash
# 完成会话
GS_SERVER=http://localhost:8443 node dist/grill.js complete $TEST_SESSION_ID

# 验证会话完成
GS_SERVER=http://localhost:8443 node dist/grill.js status $TEST_SESSION_ID --json=status
```

**预期结果**：
- 状态变为 gone
- detail 为 completed

### 6. 取消会话

```bash
# 创建新会话用于取消测试
CANCEL_SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 取消会话
GS_SERVER=http://localhost:8443 node dist/grill.js cancel $CANCEL_SESSION_ID --reason user_cancelled

# 验证会话取消
GS_SERVER=http://localhost:8443 node dist/grill.js status $CANCEL_SESSION_ID --json=status,detail
```

**预期结果**：
- 状态变为 gone
- detail 为 cancelled

### 7. 无效 JSON 处理（退出码 64）

```bash
# 尝试创建无效 JSON 的会话
echo "invalid json" | GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id

# 检查退出码
echo "Exit code: $?"
```

**预期结果**：
- 退出码为 64
- 输出错误信息

### 8. 无效 Schema 处理（退出码 64）

```bash
# 尝试创建无效 Schema 的会话
echo '{"invalid": "schema"}' | GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id

# 检查退出码
echo "Exit code: $?"
```

**预期结果**：
- 退出码为 64
- 输出错误信息

### 9. 不存在会话处理（退出码 1）

```bash
# 尝试查询不存在的会话
GS_SERVER=http://localhost:8443 node dist/grill.js status "non-existent-session-id"

# 检查退出码
echo "Exit code: $?"
```

**预期结果**：
- 退出码为 1
- 输出错误信息

### 10. 无效取消原因处理（退出码 64）

```bash
# 尝试使用无效原因取消会话
GS_SERVER=http://localhost:8443 node dist/grill.js cancel $CANCEL_SESSION_ID --reason invalid_reason

# 检查退出码
echo "Exit code: $?"
```

**预期结果**：
- 退出码为 64
- 输出错误信息

---

## Web UI 交互测试

### 1. 页面加载

```bash
# 打开浏览器访问测试 URL
echo "请打开浏览器访问: $TEST_URL"

# 或者使用命令行验证页面加载
curl -s $TEST_URL | grep -o "<title>.*</title>"
```

**预期结果**：
- 页面正常加载
- 标题为 "Grilling"

### 2. 单选题交互

```bash
# 验证单选题渲染
curl -s $TEST_URL | grep -o "q_auth"

# 验证选项渲染
curl -s $TEST_URL | grep -o "JWT"
curl -s $TEST_URL | grep -o "Session Cookies"
```

**预期结果**：
- 单选题正常渲染
- 选项显示正确

### 3. 提交成功反馈

```bash
# 验证提交按钮存在
curl -s $TEST_URL | grep -o "submit"

# 验证表单结构
curl -s $TEST_URL | grep -o "<form"
```

**预期结果**：
- 提交按钮存在
- 表单结构正确

---

## 多轮问答流程测试

### 1. 第一轮回答

```bash
# 创建新会话用于多轮测试
MULTI_SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')
export MULTI_SESSION_ID
export MULTI_URL="http://localhost:8443/#$MULTI_SESSION_ID"

# 推送第二轮问题
GS_SERVER=http://localhost:8443 node dist/grill.js push $MULTI_SESSION_ID --json=round < /tmp/round2-grilling.json

# 验证轮次变化
GS_SERVER=http://localhost:8443 node dist/grill.js status $MULTI_SESSION_ID --json=current_round
```

**预期结果**：
- 轮次从 1 变为 2
- 推送成功

### 2. 第二轮自动加载

```bash
# 打开浏览器访问第二轮 URL
echo "请打开浏览器访问: $MULTI_URL"

# 验证第二轮问题加载
curl -s $MULTI_URL | grep -o "q_db"
```

**预期结果**：
- 第二轮问题自动加载
- 问题 ID 为 q_db

### 3. 会话完成

```bash
# 完成会话
GS_SERVER=http://localhost:8443 node dist/grill.js complete $MULTI_SESSION_ID

# 验证会话完成
GS_SERVER=http://localhost:8443 node dist/grill.js status $MULTI_SESSION_ID --json=status,detail
```

**预期结果**：
- 状态变为 gone
- detail 为 completed

### 4. 会话取消

```bash
# 创建新会话用于取消测试
CANCEL_MULTI_SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 取消会话
GS_SERVER=http://localhost:8443 node dist/grill.js cancel $CANCEL_MULTI_SESSION_ID --reason user_cancelled

# 验证会话取消
GS_SERVER=http://localhost:8443 node dist/grill.js status $CANCEL_MULTI_SESSION_ID --json=status,detail
```

**预期结果**：
- 状态变为 gone
- detail 为 cancelled

---

## SSE 实时事件测试

### 1. 轮次创建事件

```bash
# 创建新会话用于 SSE 测试
SSE_SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 监听 SSE 事件（后台运行）
GS_SERVER=http://localhost:8443 node dist/grill.js poll $SSE_SESSION_ID --wait 30 &
POLL_PID=$!

# 推送新轮次
sleep 2
GS_SERVER=http://localhost:8443 node dist/grill.js push $SSE_SESSION_ID --json=round < /tmp/round2-grilling.json

# 等待事件
wait $POLL_PID
echo "Exit code: $?"
```

**预期结果**：
- 收到轮次创建事件
- 退出码为 0

### 2. 会话完成事件

```bash
# 创建新会话用于完成事件测试
COMPLETE_SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 监听 SSE 事件（后台运行）
GS_SERVER=http://localhost:8443 node dist/grill.js poll $COMPLETE_SESSION_ID --wait 30 &
POLL_PID=$!

# 完成会话
sleep 2
GS_SERVER=http://localhost:8443 node dist/grill.js complete $COMPLETE_SESSION_ID

# 等待事件
wait $POLL_PID
echo "Exit code: $?"
```

**预期结果**：
- 收到会话完成事件
- 退出码为 0

### 3. 会话取消事件

```bash
# 创建新会话用于取消事件测试
CANCEL_SSE_SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < /tmp/basic-grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 监听 SSE 事件（后台运行）
GS_SERVER=http://localhost:8443 node dist/grill.js poll $CANCEL_SSE_SESSION_ID --wait 30 &
POLL_PID=$!

# 取消会话
sleep 2
GS_SERVER=http://localhost:8443 node dist/grill.js cancel $CANCEL_SSE_SESSION_ID --reason user_cancelled

# 等待事件
wait $POLL_PID
echo "Exit code: $?"
```

**预期结果**：
- 收到会话取消事件
- 退出码为 0

---

## 错误处理测试

### 1. 无效会话 ID

```bash
# 尝试查询无效会话 ID
GS_SERVER=http://localhost:8443 node dist/grill.js status "invalid-session-id"

# 检查退出码
echo "Exit code: $?"
```

**预期结果**：
- 退出码为 1
- 输出错误信息

### 2. 不存在的会话

```bash
# 尝试查询不存在的会话
GS_SERVER=http://localhost:8443 node dist/grill.js status "00000000-0000-0000-0000-000000000000"

# 检查退出码
echo "Exit code: $?"
```

**预期结果**：
- 退出码为 1
- 输出错误信息

---

## 国际化与主题测试

### 1. 主题切换

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

**预期结果**：
- 主题切换正常
- 页面样式正确更新

### 2. 语言切换

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

**预期结果**：
- 语言切换正常
- 页面文本正确更新

---

## 清理环境

### 1. 停止 Docker 容器

```bash
# 停止并删除容器
cd /home/alice/Workspace/grill-me-sleek/e2e
docker compose -f docker-compose.e2e.yml down

# 删除数据卷（可选）
docker volume rm e2e_e2e-data 2>/dev/null || true
```

### 2. 清理临时文件

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

## 测试检查清单

### CLI 测试
- [ ] 创建会话
- [ ] 查询会话状态
- [ ] 推送新轮次
- [ ] 等待用户响应（超时）
- [ ] 完成会话
- [ ] 取消会话
- [ ] 无效 JSON 处理（退出码 64）
- [ ] 无效 Schema 处理（退出码 64）
- [ ] 不存在会话处理（退出码 1）
- [ ] 无效取消原因处理（退出码 64）

### Web UI 测试
- [ ] 页面加载
- [ ] 单选题交互
- [ ] 提交成功反馈

### 多轮流程
- [ ] 第一轮回答
- [ ] 第二轮自动加载
- [ ] 会话完成
- [ ] 会话取消

### SSE 事件
- [ ] 轮次创建事件
- [ ] 会话完成事件
- [ ] 会话取消事件

### 错误处理
- [ ] 无效会话 ID
- [ ] 不存在的会话

### 国际化与主题
- [ ] 主题切换
- [ ] 语言切换

---

## 常用命令速查

```bash
# 设置环境变量
export GS_SERVER=http://localhost:8443

# 创建会话并保存 ID
export SESSION_ID=$(GS_SERVER=http://localhost:8443 node dist/grill.js create --json=session_id < grilling.json | grep -o '"session_id": *"[^"]*"' | sed 's/.*"session_id": *"//' | sed 's/"$//')

# 查询状态
GS_SERVER=http://localhost:8443 node dist/grill.js status $SESSION_ID --json=session_id,status,current_round,name

# 推送轮次
GS_SERVER=http://localhost:8443 node dist/grill.js push $SESSION_ID --json=round < grilling.json

# 等待响应
GS_SERVER=http://localhost:8443 node dist/grill.js poll $SESSION_ID --wait 60

# 完成会话
GS_SERVER=http://localhost:8443 node dist/grill.js complete $SESSION_ID

# 取消会话
GS_SERVER=http://localhost:8443 node dist/grill.js cancel $SESSION_ID --reason user_cancelled
```

## 退出码说明

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 通用错误（API 错误、网络错误） |
| 64 | 命令行用法错误 / 输入验证失败 |
| 75 | 等待超时 |
| 76 | 会话已过期 |

## status 命令可用字段

| 字段 | 说明 |
|------|------|
| `session_id` | 会话 ID |
| `status` | 状态（active/gone） |
| `current_round` | 当前轮次 |
| `name` | 会话名称 |
| `created_at` | 创建时间 |
| `expires_at` | 过期时间 |
| `detail` | 详情（gone 时：completed/cancelled/expired） |

---

## E2E 环境规范

### Docker 构建规范

#### 1. 构建命令
```bash
# 一条命令完成构建和启动
docker compose -f docker-compose.e2e.yml up -d --build
```

#### 2. 构建流程
1. **构建镜像**：Docker 在容器内部构建前端和后端
2. **创建网络**：创建 Docker 网络
3. **创建容器**：创建 Docker 容器
4. **启动容器**：启动 Docker 容器

#### 3. 设计原则
- **一致性**：所有构建都在 Docker 内部完成，确保环境一致
- **简单性**：开发者不需要关心本地环境，只需要修改代码和构建镜像
- **可靠性**：避免本地环境差异导致的问题

### 文件规范

#### 1. `.dockerignore` 文件
```dockerignore
# Node — frontend is built inside Docker (no host node_modules or dist needed)
node_modules/
web/dist/
```

**说明**：
- 排除 `node_modules/` 和 `web/dist/`
- 确保 Docker 在容器内部构建前端
- 避免本地环境差异导致的问题

#### 2. `docker-compose.e2e.yml` 文件
```yaml
# E2E 测试环境配置
# 从最新代码构建 Docker 镜像

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
    healthcheck:
      test: ["CMD", "curl", "-fs", "http://localhost:8443/v1/healthz"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s

volumes:
  e2e-data:
```

**说明**：
- 使用 `context: ..` 指向项目根目录
- 使用 `dockerfile: docker/Dockerfile` 指向 Dockerfile
- 映射端口 8443（HTTPS）和 8080（HTTP）
- 挂载数据卷和 Caddy 配置文件
- 配置健康检查

### 开发流程规范

#### 1. 修改样式后
```bash
# 1. 修改样式文件
vim web/src/styles/globals.css

# 2. 一条命令完成构建和启动
cd e2e && docker compose -f docker-compose.e2e.yml up -d --build

# 3. 验证样式
curl -s http://localhost:8443 | grep style
```

#### 2. 修改 Rust 代码后
```bash
# 1. 修改 Rust 代码
vim server/src/main.rs

# 2. 一条命令完成构建和启动
cd e2e && docker compose -f docker-compose.e2e.yml up -d --build

# 3. 验证功能
curl -s http://localhost:8443/v1/healthz
```

#### 3. 修改前端代码后
```bash
# 1. 修改前端代码
vim web/src/components/QuestionCard.tsx

# 2. 一条命令完成构建和启动
cd e2e && docker compose -f docker-compose.e2e.yml up -d --build

# 3. 验证功能
curl -s http://localhost:8443 | grep QuestionCard
```

### 验证规范

#### 1. 验证容器状态
```bash
# 查看容器状态
docker compose -f docker-compose.e2e.yml ps

# 预期结果：
# NAME        IMAGE     COMMAND   SERVICE   CREATED          STATUS                    PORTS
# e2e-app-1   e2e-app   "/init"   app       16 seconds ago   Up 15 seconds (healthy)   0.0.0.0:8080->8080/tcp, [::]:8080->8080/tcp, 0.0.0.0:8443->8443/tcp, [::]:8443->8443/tcp
```

#### 2. 验证样式加载
```bash
# 检查加载的 CSS 文件
curl -s http://localhost:8443 | grep -o "style-[^\"]*\.css"

# 验证样式变量是否正确应用
curl -s http://localhost:8443/assets/style-*.css | grep -o "\-\-spacing-[a-z0-9]*" | sort -u

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

#### 3. 验证健康检查
```bash
# 检查健康状态
curl -s http://localhost:8443/v1/healthz

# 预期结果：
# ok
```

### 故障排除

#### 1. 构建失败
```bash
# 查看构建日志
docker compose -f docker-compose.e2e.yml build --no-cache

# 查看容器日志
docker compose -f docker-compose.e2e.yml logs -f
```

#### 2. 容器无法启动
```bash
# 检查容器状态
docker compose -f docker-compose.e2e.yml ps

# 查看容器日志
docker compose -f docker-compose.e2e.yml logs -f

# 检查端口占用
lsof -i :8443
lsof -i :8080
```

#### 3. 样式未更新
```bash
# 强制重新构建
docker compose -f docker-compose.e2e.yml build --no-cache

# 重启容器
docker compose -f docker-compose.e2e.yml up -d --build

# 验证样式
curl -s http://localhost:8443 | grep style
```

---

## 最佳实践

### 1. 开发流程
- 修改代码后，使用 `docker compose up -d --build` 一条命令完成构建和启动
- 验证样式和功能是否正常
- 使用 `docker compose logs -f` 查看日志

### 2. 测试流程
- 按照测试检查清单逐一验证
- 记录测试结果和问题
- 及时清理测试环境

### 3. 问题排查
- 先检查容器状态和日志
- 验证样式加载和健康检查
- 使用故障排除指南解决问题
