#!/usr/bin/env bash
# Manual smoke test for all Serverless Second Brain endpoints.
# Usage: ./scripts/smoke-test.sh [API_URL]
#
# Requires: curl, python3, aws CLI with credentials configured.
# API key is fetched from Terraform output automatically.

set -euo pipefail

API_URL="${1:-https://3wzbyt9i47.execute-api.us-east-1.amazonaws.com/dev}"
REGION="us-east-1"
PROJECT="ssb"
ENV="dev"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass=0
fail=0

check() {
  local name=$1 expected_status=$2 actual_status=$3
  if [ "$actual_status" = "$expected_status" ]; then
    echo -e "  ${GREEN}✅ $name${NC} ($actual_status)"
    pass=$((pass + 1))
  else
    echo -e "  ${RED}❌ $name${NC} (expected $expected_status, got $actual_status)"
    fail=$((fail + 1))
  fi
}

echo "============================================"
echo " Smoke Test — $API_URL"
echo "============================================"
echo ""

# --- Read endpoints (no auth) ---

echo "📖 Read endpoints"

STATUS=$(curl -s -o /tmp/smoke-health.json -w '%{http_code}' "$API_URL/health")
check "GET /health" "200" "$STATUS"

STATUS=$(curl -s -o /tmp/smoke-graph.json -w '%{http_code}' --max-time 30 "$API_URL/graph")
NODES=$(python3 -c "import json; d=json.load(open('/tmp/smoke-graph.json')); print(d['meta']['node_count'])" 2>/dev/null || echo "?")
EDGES=$(python3 -c "import json; d=json.load(open('/tmp/smoke-graph.json')); print(d['meta']['edge_count'])" 2>/dev/null || echo "?")
check "GET /graph ($NODES nodes, $EDGES edges)" "200" "$STATUS"

# Pick first node slug from graph
SLUG=$(python3 -c "import json; print(json.load(open('/tmp/smoke-graph.json'))['nodes'][0]['id'])" 2>/dev/null || echo "")
if [ -n "$SLUG" ]; then
  STATUS=$(curl -s -o /tmp/smoke-node.json -w '%{http_code}' "$API_URL/nodes/$SLUG")
  RELATED=$(python3 -c "import json; print(len(json.load(open('/tmp/smoke-node.json')).get('related',[])))" 2>/dev/null || echo "?")
  check "GET /nodes/$SLUG ($RELATED related)" "200" "$STATUS"
fi

STATUS=$(curl -s -o /tmp/smoke-404.json -w '%{http_code}' "$API_URL/nodes/nonexistent-slug-xyz")
check "GET /nodes/nonexistent (404)" "404" "$STATUS"

STATUS=$(curl -s -o /tmp/smoke-search.json -w '%{http_code}' --max-time 30 "$API_URL/search?q=serverless")
RESULTS=$(python3 -c "import json; print(json.load(open('/tmp/smoke-search.json'))['total'])" 2>/dev/null || echo "?")
TOOK=$(python3 -c "import json; print(json.load(open('/tmp/smoke-search.json'))['took_ms'])" 2>/dev/null || echo "?")
check "GET /search?q=serverless ($RESULTS results, ${TOOK}ms)" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/search")
check "GET /search (no q → 400)" "400" "$STATUS"

# --- Headers ---

echo ""
echo "📋 Response headers"

HEADERS=$(curl -sI "$API_URL/graph" 2>&1)
echo "$HEADERS" | grep -qi "content-type: application/json" && check "Content-Type: application/json" "present" "present" || check "Content-Type: application/json" "present" "missing"

# --- Write endpoint (needs API key) ---

echo ""
echo "✏️  Write endpoints"

API_KEY=$(cd "$(dirname "$0")/../infra/environments/$ENV" && terraform output -raw api_key_value 2>/dev/null || echo "")
if [ -z "$API_KEY" ]; then
  echo -e "  ${YELLOW}⏭  Skipping POST /capture — could not read API key from Terraform${NC}"
  echo "     Run from project root, or pass API key: API_KEY=xxx ./scripts/smoke-test.sh"
else
  TIMESTAMP=$(date +%s)
  STATUS=$(curl -s -o /tmp/smoke-capture.json -w '%{http_code}' -X POST "$API_URL/capture" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d "{
      \"text\": \"Smoke test node created at $TIMESTAMP. This is a temporary node to verify the capture pipeline works end-to-end including Bedrock classification, DynamoDB persistence, S3 body storage, and bidirectional edge creation.\",
      \"type\": \"note\",
      \"language\": \"en\"
    }")
  CREATED_SLUG=$(python3 -c "import json; print(json.load(open('/tmp/smoke-capture.json')).get('slug','?'))" 2>/dev/null || echo "?")
  check "POST /capture → $CREATED_SLUG" "201" "$STATUS"

  # Verify the node exists
  if [ "$STATUS" = "201" ] && [ "$CREATED_SLUG" != "?" ]; then
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/nodes/$CREATED_SLUG")
    check "GET /nodes/$CREATED_SLUG (verify created)" "200" "$STATUS"
  fi
fi

# --- MCP write Lambdas (direct invocation) ---

echo ""
echo "🤖 MCP tool Lambdas"

if [ -n "$SLUG" ]; then
  aws lambda invoke --function-name "${PROJECT}-${ENV}-flag" --region "$REGION" \
    --payload "{\"slug\":\"$SLUG\",\"reason\":\"smoke test\"}" \
    --cli-binary-format raw-in-base64-out /tmp/smoke-flag.json --no-cli-pager --output text --query 'StatusCode' > /dev/null 2>&1
  FLAG_STATUS=$(python3 -c "import json; print(json.load(open('/tmp/smoke-flag.json'))['statusCode'])" 2>/dev/null || echo "?")
  check "flag_stale($SLUG)" "200" "$FLAG_STATUS"

  # Connect needs two valid slugs
  SLUG2=$(python3 -c "import json; ns=json.load(open('/tmp/smoke-graph.json'))['nodes']; print(ns[1]['id'] if len(ns)>1 else '')" 2>/dev/null || echo "")
  if [ -n "$SLUG2" ] && [ "$SLUG" != "$SLUG2" ]; then
    aws lambda invoke --function-name "${PROJECT}-${ENV}-connect" --region "$REGION" \
      --payload "{\"source\":\"$SLUG\",\"target\":\"$SLUG2\"}" \
      --cli-binary-format raw-in-base64-out /tmp/smoke-connect.json --no-cli-pager --output text --query 'StatusCode' > /dev/null 2>&1
    CONN_STATUS=$(python3 -c "import json; print(json.load(open('/tmp/smoke-connect.json'))['statusCode'])" 2>/dev/null || echo "?")
    check "connect_nodes($SLUG → $SLUG2)" "201" "$CONN_STATUS"
  fi
fi

# --- Summary ---

echo ""
echo "============================================"
total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  echo -e " ${GREEN}All $total checks passed ✅${NC}"
else
  echo -e " ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC} out of $total"
fi
echo "============================================"

# Cleanup
rm -f /tmp/smoke-*.json

exit "$fail"
