#!/usr/bin/env bash
# 混沌编排（S5 闪断 / S6 崩溃恢复）—— 制造故障并记录精确时间线。
#
# 用法: chaos.sh kill9|restart
#   kill9    — kill -9 后端进程（s6 自动拉起）→ 测崩溃恢复
#   restart  — 整容器重启（后端+Caddy 都断）→ 测重连风暴 + 恢复
# 输出：t_kill / t_healthy(healthz ok) / t_ready(readyz ok) 毫秒时间线。

set -u
MODE="${1:?kill9|restart}"
BASE="${BASE_URL:-https://localhost:8443}"
CONT="${CONTAINER:-grill-load}"

T0=$(date +%s%3N)

PID=$(docker exec "$CONT" sh -c \
  "ps aux 2>/dev/null | grep -E '[g]rilling-sleek' | grep -v caddy | awk '{print \$1}' | head -1")
if [ -z "$PID" ]; then
  echo "backend pid not found" >&2
  exit 1
fi
echo "t_kill=$T0 pid=$PID mode=$MODE"

if [ "$MODE" = "kill9" ]; then
  docker exec "$CONT" kill -9 "$PID"
else
  docker restart "$CONT" >/dev/null
fi

# 0.3s 粒度轮询 healthz / readyz
T_HEALTHY=""
T_READY=""
while [ $(( $(date +%s%3N) - T0 )) -lt 180000 ]; do
  NOW=$(date +%s%3N)
  if [ -z "$T_HEALTHY" ] && curl -sfk --max-time 2 "$BASE/v1/healthz" >/dev/null 2>&1; then
    T_HEALTHY=$NOW
    echo "t_healthy=$((T_HEALTHY - T0))ms"
  fi
  if [ -n "$T_HEALTHY" ] && [ -z "$T_READY" ] && curl -sfk --max-time 2 "$BASE/v1/readyz" >/dev/null 2>&1; then
    T_READY=$NOW
    echo "t_ready=$((T_READY - T0))ms"
    exit 0
  fi
  sleep 0.3
done
echo "timeout waiting recovery" >&2
exit 1
