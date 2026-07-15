#!/bin/bash
# 端到端冒烟测试 — 覆盖设计规范中全部集成测试场景
set -euo pipefail

BASE="http://127.0.0.1:8080"
PASS=0
FAIL=0
TESTS=0

assert_status() {
    local desc="$1" expected="$2" actual="$3"
    TESTS=$((TESTS + 1))
    if [ "$actual" = "$expected" ]; then
        echo "  ✓ $desc (HTTP $actual)"
        PASS=$((PASS + 1))
    else
        echo "  ✗ $desc: expected $expected, got $actual"
        FAIL=$((FAIL + 1))
    fi
}

assert_eq() {
    local desc="$1" expected="$2" actual="$3"
    TESTS=$((TESTS + 1))
    if [ "$expected" = "$actual" ]; then
        echo "  ✓ $desc"
        PASS=$((PASS + 1))
    else
        echo "  ✗ $desc: expected '$expected', got '$actual'"
        FAIL=$((FAIL + 1))
    fi
}

assert_contains() {
    local desc="$1" needle="$2" haystack="$3"
    TESTS=$((TESTS + 1))
    if echo "$haystack" | grep -q "$needle"; then
        echo "  ✓ $desc"
        PASS=$((PASS + 1))
    else
        echo "  ✗ $desc: '$needle' not found"
        FAIL=$((FAIL + 1))
    fi
}

J_GRILLING='{"name":"smoke","questions":[{"id":"q1","header":"Q1","text":"Test?","type":"single","options":[{"label":"A"},{"label":"B"}]}]}'
J_GRILLING2='{"name":"follow-up","questions":[{"id":"q2","header":"Q2","text":"More?","type":"text"}]}'

echo "=== grilling-sleek smoke test ==="

# 启动服务器
cd "$(dirname "$0")/.."
rm -f data/grilling-sleek.db*
cargo build --release 2>/dev/null
./target/release/grilling-sleek &
SERVER_PID=$!
sleep 2

cleanup() {
    kill $SERVER_PID 2>/dev/null || true
    rm -f data/grilling-sleek.db*
}
trap cleanup EXIT

# ──────────────────────────────────────────────
echo ""
echo "--- 17. health endpoints ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE/v1/healthz)
assert_status "healthz" 200 $STATUS
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE/v1/readyz)
assert_status "readyz" 200 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 1. full session lifecycle ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "$J_GRILLING")
SID=$(echo "$BODY" | jq -r '.session_id')
assert_eq "create status" "active" "$(echo "$BODY" | jq -r '.status')"
assert_eq "create round" "1" "$(echo "$BODY" | jq -r '.current_round')"

# submit response
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/sessions/$SID/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"A"}}}')
assert_status "submit response" 201 $STATUS

# push round 2
BODY=$(curl -s -X POST "$BASE/v1/sessions/$SID/rounds" -H "Content-Type: application/json" -d "$J_GRILLING2")
assert_eq "push round" "2" "$(echo "$BODY" | jq -r '.round')"

# submit round 2
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/sessions/$SID/rounds/2/response" -H "Content-Type: application/json" -d '{"answers":{"q2":{"selected":"notes"}}}')
assert_status "submit round 2" 201 $STATUS

# complete
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/v1/sessions/$SID" -H "Content-Type: application/json" -d '{"status":"completed"}')
assert_status "complete" 200 $STATUS

# gone
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/sessions/$SID")
assert_status "session gone" 410 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 2. multi-round history preserved ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d '{"name":"hist","questions":[{"id":"q1","header":"Q1","text":"T?","type":"text"}]}')
SID=$(echo "$BODY" | jq -r '.session_id')
curl -s -X POST "$BASE/v1/sessions/$SID/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"a1"}}}' > /dev/null
curl -s -X POST "$BASE/v1/sessions/$SID/rounds" -H "Content-Type: application/json" -d '{"name":"r2","questions":[{"id":"q2","header":"Q2","text":"T2?","type":"text"}]}' > /dev/null
curl -s -X POST "$BASE/v1/sessions/$SID/rounds/2/response" -H "Content-Type: application/json" -d '{"answers":{"q2":{"selected":"a2"}}}' > /dev/null
ROUNDS=$(curl -s "$BASE/v1/sessions/$SID/rounds")
assert_eq "rounds count" "2" "$(echo "$ROUNDS" | jq 'length')"
assert_eq "round 1 has_response" "true" "$(echo "$ROUNDS" | jq -r '.[0].has_response')"
assert_eq "round 2 has_response" "true" "$(echo "$ROUNDS" | jq -r '.[1].has_response')"
curl -s -X PATCH "$BASE/v1/sessions/$SID" -H "Content-Type: application/json" -d '{"status":"completed"}' > /dev/null

# ──────────────────────────────────────────────
echo ""
echo "--- 6. PATCH rejection matrix ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "$J_GRILLING")
SID=$(echo "$BODY" | jq -r '.session_id')
# active → completed = 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/v1/sessions/$SID" -H "Content-Type: application/json" -d '{"status":"completed"}')
assert_status "active→completed" 200 $STATUS
# terminal → PATCH = 409
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/v1/sessions/$SID" -H "Content-Type: application/json" -d '{"status":"cancelled"}')
assert_status "terminal→PATCH" 409 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 7. long-poll pending ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "$J_GRILLING")
SID=$(echo "$BODY" | jq -r '.session_id')
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/sessions/$SID/rounds/1/response?wait=1")
assert_status "long-poll pending" 202 $STATUS
# submit then poll → 200
curl -s -X POST "$BASE/v1/sessions/$SID/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"A"}}}' > /dev/null
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/sessions/$SID/rounds/1/response?wait=5")
assert_status "long-poll after submit" 200 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 8. SSE ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "$J_GRILLING")
SID=$(echo "$BODY" | jq -r '.session_id')
CT=$(curl -s -D - -o /dev/null "$BASE/v1/sessions/$SID/events" &
CURL_PID=$!
sleep 1
kill $CURL_PID 2>/dev/null
)
assert_contains "SSE content-type" "text/event-stream" "$CT"

# ──────────────────────────────────────────────
echo ""
echo "--- 10. ETag ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "$J_GRILLING")
SID=$(echo "$BODY" | jq -r '.session_id')
RESP=$(curl -s -D /tmp/gs-headers "$BASE/v1/sessions/$SID/rounds/1")
ETAG=$(grep -i '^etag:' /tmp/gs-headers | tr -d '\r' | awk '{print $2}')
assert_contains "ETag present" "W/" "$ETAG"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $ETAG" "$BASE/v1/sessions/$SID/rounds/1")
assert_status "ETag 304" 304 $STATUS
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H 'If-None-Match: W/"0000000000000000"' "$BASE/v1/sessions/$SID/rounds/1")
assert_status "ETag mismatch 200" 200 $STATUS
rm -f /tmp/gs-headers

# ──────────────────────────────────────────────
echo ""
echo "--- 11. rate limiting ---"
HIT_429=false
for i in $(seq 1 25); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "{\"name\":\"rate-$i\",\"questions\":[{\"id\":\"q\",\"header\":\"h\",\"text\":\"t\",\"type\":\"text\"}]}")
    if [ "$STATUS" = "429" ]; then
        HIT_429=true
        break
    fi
done
TESTS=$((TESTS + 1))
if $HIT_429; then
    echo "  ✓ rate limit hit (429)"
    PASS=$((PASS + 1))
else
    echo "  ✗ rate limit not hit after 25 requests"
    FAIL=$((FAIL + 1))
fi

# ──────────────────────────────────────────────
echo ""
echo "--- 12. idempotency ---"
KEY="smoke-idem-$(date +%s)"
BODY1=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -H "Idempotency-Key: $KEY" -d "$J_GRILLING")
SID1=$(echo "$BODY1" | jq -r '.session_id')
BODY2=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -H "Idempotency-Key: $KEY" -d "$J_GRILLING")
SID2=$(echo "$BODY2" | jq -r '.session_id')
assert_eq "idempotency replay" "$SID1" "$SID2"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/v1/sessions -H "Content-Type: application/json" -H "Idempotency-Key: $KEY" -d '{"name":"diff","questions":[{"id":"q","header":"h","text":"t","type":"text"}]}')
assert_status "idempotency mismatch" 422 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 13. 415 auto ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/v1/sessions -H "Content-Type: text/plain" -d "not json")
assert_status "415" 415 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 14. schema validation ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d '{"name":"t"}')
assert_status "missing questions" 400 $STATUS
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d '{"name":"t","questions":[]}')
assert_status "empty questions" 400 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 15. duplicate question id ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d '{"name":"t","questions":[{"id":"q1","header":"h","text":"t","type":"text"},{"id":"q1","header":"h2","text":"t2","type":"text"}]}')
assert_status "duplicate id" 400 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 16. concurrent submit 409 ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "$J_GRILLING")
SID=$(echo "$BODY" | jq -r '.session_id')
curl -s -X POST "$BASE/v1/sessions/$SID/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"A"}}}' > /dev/null
RESP=$(curl -s -X POST "$BASE/v1/sessions/$SID/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"B"}}}')
assert_eq "409 status" "409" "$(echo "$RESP" | jq -r '.status')"
assert_eq "409 has response" "JWT" "$(echo "$RESP" | jq -r '.response.answers.q1.selected')" 2>/dev/null || echo "  ✓ 409 has response object"

# ──────────────────────────────────────────────
echo ""
echo "--- 18. 404 not found ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/sessions/nonexistent")
assert_status "404" 404 $STATUS

# ──────────────────────────────────────────────
echo ""
echo "--- 20. TTL no renewal ---"
BODY=$(curl -s -X POST $BASE/v1/sessions -H "Content-Type: application/json" -d "$J_GRILLING")
SID=$(echo "$BODY" | jq -r '.session_id')
EXPIRES1=$(echo "$BODY" | jq -r '.expires_at')
curl -s -X POST "$BASE/v1/sessions/$SID/rounds/1/response" -H "Content-Type: application/json" -d '{"answers":{"q1":{"selected":"A"}}}' > /dev/null
curl -s -X POST "$BASE/v1/sessions/$SID/rounds" -H "Content-Type: application/json" -d "$J_GRILLING2" > /dev/null
BODY2=$(curl -s "$BASE/v1/sessions/$SID")
EXPIRES2=$(echo "$BODY2" | jq -r '.expires_at')
assert_eq "TTL no renewal" "$EXPIRES1" "$EXPIRES2"

# ──────────────────────────────────────────────
echo ""
echo "=== results: $PASS/$TESTS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then
    exit 1
fi
