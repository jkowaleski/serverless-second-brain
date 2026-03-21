#!/usr/bin/env bash
# Smoke test for all Serverless Second Brain endpoints and services.
# Usage: ./scripts/smoke-test.sh [API_URL]
#
# Requires: curl, python3, aws CLI with credentials configured.
# Cognito credentials are fetched from Terraform output automatically.

set -euo pipefail

REGION="us-east-1"
PROJECT="ssb"
ENV="dev"
INFRA_DIR="$(cd "$(dirname "$0")/../infra/environments/$ENV" && pwd)"

# Resolve API URL: argument > SSM > Terraform > hardcoded fallback
if [ -n "${1:-}" ]; then
  API_URL="$1"
elif API_URL=$(aws ssm get-parameter --name "/$PROJECT/$ENV/api/url" --query Parameter.Value --output text --region "$REGION" 2>/dev/null); then
  :
elif API_URL=$(cd "$INFRA_DIR" && terraform output -raw api_gateway_invoke_url 2>/dev/null); then
  :
else
  API_URL="https://3wzbyt9i47.execute-api.us-east-1.amazonaws.com/dev"
fi

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

# Retry wrapper: curl_retry URL [extra curl args...]
# Retries up to 3 times on 500/502/503/504 or curl timeout, with 3s backoff.
curl_retry() {
  local url=$1; shift
  local attempt max_attempts=3 status
  for attempt in $(seq 1 $max_attempts); do
    status=$(curl -s -o /tmp/smoke-last.json -w '%{http_code}' --max-time 30 "$@" "$url" 2>/dev/null || echo "000")
    case "$status" in
      500|502|503|504|000)
        if [ "$attempt" -lt "$max_attempts" ]; then
          sleep 3
          continue
        fi
        ;;
    esac
    break
  done
  # Copy response to the caller's output file if -o was in the args
  echo "$status"
}

echo "============================================"
echo " Smoke Test — $API_URL"
echo "============================================"

# ==========================================
# 1. Health & connectivity
# ==========================================
echo ""
echo "🏥 Health"

STATUS=$(curl_retry "$API_URL/health")
cp /tmp/smoke-last.json /tmp/smoke-health.json 2>/dev/null || true
check "GET /health" "200" "$STATUS"

HEADERS=$(curl -sI "$API_URL/graph" 2>&1)
echo "$HEADERS" | grep -qi "content-type: application/json" && check "Content-Type: application/json" "present" "present" || check "Content-Type: application/json" "present" "missing"

# ==========================================
# 2. Read API (Phase 2)
# ==========================================
echo ""
echo "📖 Read API"

STATUS=$(curl_retry "$API_URL/graph")
cp /tmp/smoke-last.json /tmp/smoke-graph.json 2>/dev/null || true
NODES=$(python3 -c "import json; d=json.load(open('/tmp/smoke-graph.json')); print(d['meta']['node_count'])" 2>/dev/null || echo "?")
EDGES=$(python3 -c "import json; d=json.load(open('/tmp/smoke-graph.json')); print(d['meta']['edge_count'])" 2>/dev/null || echo "?")
check "GET /graph ($NODES nodes, $EDGES edges)" "200" "$STATUS"

SLUG=$(python3 -c "import json; print(json.load(open('/tmp/smoke-graph.json'))['nodes'][0]['id'])" 2>/dev/null || echo "")
if [ -n "$SLUG" ]; then
  STATUS=$(curl_retry "$API_URL/nodes/$SLUG")
  cp /tmp/smoke-last.json /tmp/smoke-node.json 2>/dev/null || true
  RELATED=$(python3 -c "import json; print(len(json.load(open('/tmp/smoke-node.json')).get('related',[])))" 2>/dev/null || echo "?")
  check "GET /nodes/$SLUG ($RELATED related)" "200" "$STATUS"
fi

STATUS=$(curl_retry "$API_URL/nodes/nonexistent-slug-xyz")
check "GET /nodes/nonexistent (404)" "404" "$STATUS"

STATUS=$(curl_retry "$API_URL/search?q=serverless")
cp /tmp/smoke-last.json /tmp/smoke-search.json 2>/dev/null || true
RESULTS=$(python3 -c "import json; print(json.load(open('/tmp/smoke-search.json'))['total'])" 2>/dev/null || echo "?")
TOOK=$(python3 -c "import json; print(json.load(open('/tmp/smoke-search.json'))['took_ms'])" 2>/dev/null || echo "?")
check "GET /search?q=serverless ($RESULTS results, ${TOOK}ms)" "200" "$STATUS"

STATUS=$(curl_retry "$API_URL/search")
check "GET /search (no q → 400)" "400" "$STATUS"

# ==========================================
# 3. Write API (Phase 1 — capture pipeline)
# ==========================================
echo ""
echo "✏️  Capture pipeline"

COGNITO_DOMAIN=$(cd "$INFRA_DIR" && terraform output -raw cognito_domain 2>/dev/null || echo "")
MCP_CLIENT_ID=$(cd "$INFRA_DIR" && terraform output -raw cognito_mcp_client_id 2>/dev/null || echo "")
MCP_SECRET=$(cd "$INFRA_DIR" && terraform output -raw cognito_mcp_client_secret 2>/dev/null || echo "")

if [ -z "$COGNITO_DOMAIN" ] || [ -z "$MCP_CLIENT_ID" ] || [ -z "$MCP_SECRET" ]; then
  echo -e "  ${YELLOW}⏭  Skipping POST /capture — could not read Cognito credentials from Terraform${NC}"
else
  TOKEN=$(curl -s -X POST "$COGNITO_DOMAIN/oauth2/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -u "$MCP_CLIENT_ID:$MCP_SECRET" \
    -d "grant_type=client_credentials&scope=ssb-api/read ssb-api/write" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

  if [ -z "$TOKEN" ]; then
    echo -e "  ${YELLOW}⏭  Skipping POST /capture — could not obtain Cognito token${NC}"
  else
    TIMESTAMP=$(date +%s)
    STATUS=$(curl_retry "$API_URL/capture" \
      -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{
        \"text\": \"Smoke test $TIMESTAMP — verifying the capture pipeline processes text through Bedrock classification, DynamoDB persistence, S3 body storage, and edge creation end-to-end.\",
        \"type\": \"note\",
        \"language\": \"en\"
      }")
    cp /tmp/smoke-last.json /tmp/smoke-capture.json 2>/dev/null || true
    CREATED_SLUG=$(python3 -c "import json; d=json.load(open('/tmp/smoke-capture.json')); print(d.get('slug','?') if isinstance(d,dict) else json.loads(d).get('slug','?'))" 2>/dev/null || echo "?")
    check "POST /capture → $CREATED_SLUG" "201" "$STATUS"

    if [ "$STATUS" = "201" ] && [ "$CREATED_SLUG" != "?" ]; then
      STATUS=$(curl_retry "$API_URL/nodes/$CREATED_SLUG" -H "Authorization: Bearer $TOKEN")
      check "GET /nodes/$CREATED_SLUG (verify created)" "200" "$STATUS"
    fi
  fi
fi

# ==========================================
# 4. MCP tool Lambdas (Phase 3 — agent door)
# ==========================================
echo ""
echo "🤖 MCP tool Lambdas"

if [ -n "$SLUG" ]; then
  aws lambda invoke --function-name "${PROJECT}-${ENV}-flag" --region "$REGION" \
    --payload "{\"slug\":\"$SLUG\",\"reason\":\"smoke test\"}" \
    --cli-binary-format raw-in-base64-out /tmp/smoke-flag.json --no-cli-pager --output text --query 'StatusCode' > /dev/null 2>&1
  FLAG_STATUS=$(python3 -c "import json; print(json.load(open('/tmp/smoke-flag.json'))['statusCode'])" 2>/dev/null || echo "?")
  check "flag_stale($SLUG)" "200" "$FLAG_STATUS"

  SLUG2=$(python3 -c "import json; ns=json.load(open('/tmp/smoke-graph.json'))['nodes']; print(ns[1]['id'] if len(ns)>1 else '')" 2>/dev/null || echo "")
  if [ -n "$SLUG2" ] && [ "$SLUG" != "$SLUG2" ]; then
    aws lambda invoke --function-name "${PROJECT}-${ENV}-connect" --region "$REGION" \
      --payload "{\"source\":\"$SLUG\",\"target\":\"$SLUG2\"}" \
      --cli-binary-format raw-in-base64-out /tmp/smoke-connect.json --no-cli-pager --output text --query 'StatusCode' > /dev/null 2>&1
    CONN_STATUS=$(python3 -c "import json; print(json.load(open('/tmp/smoke-connect.json'))['statusCode'])" 2>/dev/null || echo "?")
    check "connect_nodes($SLUG → $SLUG2)" "201" "$CONN_STATUS"
  fi
fi

RUNTIME_ID=$(cd "$INFRA_DIR" && terraform output -raw agentcore_runtime_id 2>/dev/null || echo "")
if [ -n "$RUNTIME_ID" ]; then
  check "AgentCore Runtime ($RUNTIME_ID)" "present" "present"
else
  check "AgentCore Runtime" "present" "missing"
fi

# ==========================================
# 5. Surfacing (Phase 4 — proactive)
# ==========================================
echo ""
echo "📊 Surfacing"

aws lambda invoke --function-name "${PROJECT}-${ENV}-surfacing" --region "$REGION" \
  --payload '{"source":"smoke-test","detail-type":"DailySurfacing","detail":{"run_id":"smoke"}}' \
  --cli-binary-format raw-in-base64-out /tmp/smoke-surfacing.json --no-cli-pager --output text --query 'StatusCode' > /dev/null 2>&1
SURF_OK=$(python3 -c "import json; d=json.load(open('/tmp/smoke-surfacing.json')); print('200' if 'summary' in d else '500')" 2>/dev/null || echo "?")
SURF_SUMMARY=$(python3 -c "
import json; d=json.load(open('/tmp/smoke-surfacing.json'))
s=d.get('summary',{})
print(f\"stale={s.get('stale_seeds','?')} orphans={s.get('orphan_nodes','?')} gaps={s.get('content_gaps','?')}\")
" 2>/dev/null || echo "?")
check "surfacing digest ($SURF_SUMMARY)" "200" "$SURF_OK"

# ==========================================
# Results
# ==========================================
echo ""
echo "============================================"
total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  echo -e " ${GREEN}All $total checks passed ✅${NC}"
else
  echo -e " ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC} out of $total"
fi
echo "============================================"

rm -f /tmp/smoke-*.json

exit "$fail"
