#!/usr/bin/env bash
# 资源采样器 —— 压测期间持续记录容器/后端进程资源，供 analyze.py 合并出曲线。
#
# 用法: sampler.sh <container> <outfile> [interval_s]
# 输出（单行 JSON）：
#   {t, mem, cpu, anon, file, rss, fd, db, wal}
#   mem  — docker stats 容器内存（含内核文件缓存）
#   anon — 后端进程匿名页（SQLite 页缓存+运行时，不可回收 → OOM 驱动）
#   fd   — 后端进程 FD 数（连接/SSE 泄漏观测）

set -u
CONT="${1:?container}"
OUT="${2:?outfile}"
IV="${3:-5}"

PID=""
discover_pid() {
  PID=$(docker exec "$CONT" sh -c \
    "ps aux 2>/dev/null | grep -E '[g]rilling-sleek' | grep -v caddy | awk '{print \$1}' | head -1")
}

while docker inspect "$CONT" >/dev/null 2>&1; do
  TS=$(date +%s%3N)
  STATS=$(docker stats --no-stream --format '{{.MemUsage}}|{{.CPUPerc}}' "$CONT" 2>/dev/null)
  MEM="${STATS%%|*}"
  MEM="${MEM%% *}"
  CPU="${STATS##*|}"
  [ -z "$PID" ] && discover_pid
  ANON=""; FILE_=""; RSS=""; FD=""
  if [ -n "$PID" ]; then
    READS=$(docker exec "$CONT" sh -c "grep -E '^(RssAnon|RssFile|VmRSS):' /proc/$PID/status 2>/dev/null" || true)
    if [ -z "$READS" ]; then
      discover_pid  # 进程重启过，重新发现
      READS=$(docker exec "$CONT" sh -c "grep -E '^(RssAnon|RssFile|VmRSS):' /proc/$PID/status 2>/dev/null" || true)
    fi
    ANON=$(echo "$READS" | awk '/RssAnon/{print $2}')
    FILE_=$(echo "$READS" | awk '/RssFile/{print $2}')
    RSS=$(echo "$READS" | awk '/VmRSS/{print $2}')
    FD=$(docker exec "$CONT" sh -c "ls /proc/$PID/fd 2>/dev/null | wc -l" || true)
  fi
  DB=$(docker exec "$CONT" stat -c %s /app/data/grilling-sleek.db 2>/dev/null || echo 0)
  WAL=$(docker exec "$CONT" stat -c %s /app/data/grilling-sleek.db-wal 2>/dev/null || echo 0)
  printf '{"t":%s,"mem":"%s","cpu":"%s","anon":%s,"file":%s,"rss":%s,"fd":%s,"db":%s,"wal":%s}\n' \
    "$TS" "$MEM" "$CPU" "${ANON:-0}" "${FILE_:-0}" "${RSS:-0}" "${FD:-0}" "$DB" "$WAL" >> "$OUT"
  sleep "$IV"
done
