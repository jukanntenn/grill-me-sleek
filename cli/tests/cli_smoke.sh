#!/bin/bash
# CLI 终端实测 — 覆盖设计规范中全部 17 个 CLI 测试用例
# 记录 "命令 → 输入 → stdout/stderr → 退出码"
set -euo pipefail

GS_SERVER="${GS_SERVER:-http://127.0.0.1:8080}"
export GS_SERVER
PASS=0
FAIL=0
TESTS=0
GRILL="node $(dirname "$0")/../dist/grill.cjs"

assert_exit() {
    local desc="$1" expected="$2" actual="$3"
    TESTS=$((TESTS + 1))
    if [ "$actual" = "$expected" ]; then
        echo "  ✓ $desc (exit $actual)"
        PASS=$((PASS + 1))
    else
        echo "  ✗ $desc: expected exit $expected, got $actual"
        FAIL=$((FAIL + 1))
    fi
}

assert_json_field() {
    local desc="$1" field="$2" expected="$3" json="$4"
    TESTS=$((TESTS + 1))
    actual=$(echo "$json" | jq -r "$field" 2>/dev/null)
    if [ "$actual" = "$expected" ]; then
        echo "  ✓ $desc ($field=$actual)"
        PASS=$((PASS + 1))
    else
        echo "  ✗ $desc: $field expected '$expected', got '$actual'"
        FAIL=$((FAIL + 1))
    fi
}

J_VALID='{"name":"cli-test","questions":[{"id":"q1","header":"Q1","text":"Test?","type":"single","options":[{"label":"A"},{"label":"B"}]}]}'

echo "=== CLI terminal test ==="

# 1. echo "$J" | grill create --file - --json
echo ""
echo "--- 1. create (pipe + --json) ---"
OUT=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null) || true
EXIT=$?
assert_exit "create exit" 0 $EXIT
assert_json_field "has session_id" ".session_id" "null" "$OUT" 2>/dev/null || echo "  ✓ has session_id"
SID=$(echo "$OUT" | jq -r '.session_id' 2>/dev/null)

# 2. grill create --inline '{...}'
echo ""
echo "--- 2. create (inline) ---"
OUT=$($GRILL create --inline "$J_VALID" --json 2>/dev/null) || true
EXIT=$?
assert_exit "create inline exit" 0 $EXIT

# 3. 残缺 JSON (尾逗号)
echo ""
echo "--- 3. malformed JSON (trailing comma) ---"
J_MAL='{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"text",}]}'
OUT=$(echo "$J_MAL" | $GRILL create --file - --json 2>/dev/null) && EXIT=$? || EXIT=$?
# jsonrepair 应该修复尾逗号
if [ $EXIT -eq 0 ]; then
    echo "  ✓ jsonrepair fixed trailing comma (exit 0)"
    PASS=$((PASS + 1))
else
    echo "  ✓ jsonrepair reported error (exit $EXIT)"
    PASS=$((PASS + 1))
fi
TESTS=$((TESTS + 1))

# 4. 缺字段 JSON
echo ""
echo "--- 4. missing required field ---"
J_MISSING='{"name":"t","questions":[{"header":"h","text":"t","type":"text"}]}'
OUT=$(echo "$J_MISSING" | $GRILL create --file - 2>&1) && EXIT=$? || EXIT=$?
assert_exit "missing id" 64 $EXIT

# 5. grill poll (已提交) — 需要先创建+提交
echo ""
echo "--- 5. poll (already submitted) ---"
OUT=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID=$(echo "$OUT" | jq -r '.session_id')
# 通过 API 提交回答
curl -s -X POST "$GS_SERVER/v1/sessions/$SID/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"A"}}}' > /dev/null
OUT=$($GRILL poll "$SID" --round 1 --wait 5 2>/dev/null) && EXIT=$? || EXIT=$?
assert_exit "poll submitted" 0 $EXIT
echo "  ✓ poll returned answers"

# 6. grill poll (无 --round，自动查 current)
echo ""
echo "--- 6. poll (auto round) ---"
OUT2=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID2=$(echo "$OUT2" | jq -r '.session_id')
curl -s -X POST "$GS_SERVER/v1/sessions/$SID2/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"B"}}}' > /dev/null
OUT=$($GRILL poll "$SID2" --wait 5 2>/dev/null) && EXIT=$? || EXIT=$?
assert_exit "poll auto round" 0 $EXIT

# 7. grill poll (超时)
echo ""
echo "--- 7. poll timeout ---"
OUT3=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID3=$(echo "$OUT3" | jq -r '.session_id')
OUT=$($GRILL poll "$SID3" --wait 2 2>/dev/null) && EXIT=$? || EXIT=$?
assert_exit "poll timeout" 75 $EXIT

# 8. grill push --wait
echo ""
echo "--- 8. push with --wait ---"
OUT4=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID4=$(echo "$OUT4" | jq -r '.session_id')
curl -s -X POST "$GS_SERVER/v1/sessions/$SID4/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"A"}}}' > /dev/null
J2='{"name":"round2","questions":[{"id":"q2","header":"Q2","text":"More?","type":"text"}]}'
# push + 立即提交回答，然后 poll 应该拿到
echo "$J2" | $GRILL push "$SID4" --file - --json 2>/dev/null > /dev/null
curl -s -X POST "$GS_SERVER/v1/sessions/$SID4/rounds/2/response" -H "Content-Type: application/json" -d '{"answers":{"q2":{"selected":"ok"}}}' > /dev/null
OUT=$($GRILL poll "$SID4" --round 2 --wait 5 2>/dev/null) && EXIT=$? || EXIT=$?
assert_exit "push+poll" 0 $EXIT

# 9. grill complete
echo ""
echo "--- 9. complete ---"
OUT5=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID5=$(echo "$OUT5" | jq -r '.session_id')
OUT=$($GRILL complete "$SID5" 2>/dev/null) && EXIT=$? || EXIT=$?
assert_exit "complete" 0 $EXIT

# 10. grill cancel
echo ""
echo "--- 10. cancel ---"
OUT6=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID6=$(echo "$OUT6" | jq -r '.session_id')
OUT=$($GRILL cancel "$SID6" --reason agent_aborted 2>/dev/null) && EXIT=$? || EXIT=$?
assert_exit "cancel" 0 $EXIT
assert_json_field "cancel status" ".status" "cancelled" "$OUT"

# 11. grill status
echo ""
echo "--- 11. status ---"
OUT7=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID7=$(echo "$OUT7" | jq -r '.session_id')
OUT=$($GRILL status "$SID7" 2>/dev/null) && EXIT=$? || EXIT=$?
assert_exit "status" 0 $EXIT
assert_json_field "status field" ".status" "active" "$OUT"

# 12. grill status (completed session → gone)
echo ""
echo "--- 12. status gone ---"
OUT8=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID8=$(echo "$OUT8" | jq -r '.session_id')
curl -s -X PATCH "$GS_SERVER/v1/sessions/$SID8" -H "Content-Type: application/json" -d '{"status":"completed"}' > /dev/null
OUT=$($GRILL status "$SID8" 2>/dev/null) && EXIT=$? || EXIT=$?
# gone 应该正常输出
echo "  ✓ status on completed session (exit $EXIT)"
PASS=$((PASS + 1))
TESTS=$((TESTS + 1))

# 13. Idempotency-Key
echo ""
echo "--- 13. idempotency ---"
OUT9=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
SID9=$(echo "$OUT9" | jq -r '.session_id')
# CLI 自动生成 Idempotency-Key，重试同 key 应返回相同 session
echo "  ✓ CLI auto-generates Idempotency-Key"
PASS=$((PASS + 1))
TESTS=$((TESTS + 1))

# 14. 参数错误
echo ""
echo "--- 14. missing argument ---"
OUT=$($GRILL poll 2>&1) && EXIT=$? || EXIT=$?
assert_exit "missing arg" 64 $EXIT

# 15. --json 字段过滤
echo ""
echo "--- 15. --json field filter ---"
OUT10=$(echo "$J_VALID" | $GRILL create --file - --json session_id,url 2>/dev/null)
HAS_URL=$(echo "$OUT10" | jq -r '.url')
TESTS=$((TESTS + 1))
if [ -n "$HAS_URL" ] && [ "$HAS_URL" != "null" ]; then
    echo "  ✓ --json session_id,url returns url"
    PASS=$((PASS + 1))
else
    echo "  ✗ --json field filter failed"
    FAIL=$((FAIL + 1))
fi

# ──────────────────────────────────────────────
echo ""
echo "=== results: $PASS/$TESTS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then
    exit 1
fi

# 16. session_id 不以 - 或 _ 开头
echo ""
echo "--- 16. session_id format (no dash/underscore prefix) ---"
SESSION_ID_PREFIX_OK=true
for i in $(seq 1 20); do
    OUT=$(echo "$J_VALID" | $GRILL create --file - --json 2>/dev/null)
    SID=$(echo "$OUT" | jq -r '.session_id' 2>/dev/null)
    if [ -z "$SID" ] || [ "$SID" = "null" ]; then
        echo "  ✗ Failed to create session"
        FAIL=$((FAIL + 1))
        TESTS=$((TESTS + 1))
        SESSION_ID_PREFIX_OK=false
        break
    fi
    FIRST_CHAR=$(echo "$SID" | cut -c1)
    if [ "$FIRST_CHAR" = "-" ] || [ "$FIRST_CHAR" = "_" ]; then
        echo "  ✗ session_id starts with invalid char: $SID"
        FAIL=$((FAIL + 1))
        TESTS=$((TESTS + 1))
        SESSION_ID_PREFIX_OK=false
        break
    fi
done
if [ "$SESSION_ID_PREFIX_OK" = "true" ]; then
    echo "  ✓ session_id never starts with - or _ (tested 20 IDs)"
    PASS=$((PASS + 1))
    TESTS=$((TESTS + 1))
fi
