#!/usr/bin/env bash
# Rollback agent-created nodes by querying the audit trail.
# Usage: ./scripts/rollback-agent.sh [--dry-run] [--actor ACTOR]
#
# Finds all nodes created by agents (created_by starts with "agent:")
# and deletes them from DynamoDB + S3. Dry-run by default.

set -euo pipefail

REGION="us-east-1"
PROJECT="ssb"
ENV="dev"
TABLE="${PROJECT}-${ENV}-knowledge-graph"
BUCKET="${PROJECT}-${ENV}-content"
DRY_RUN=true
ACTOR_PREFIX="agent:"

while [[ $# -gt 0 ]]; do
  case $1 in
    --execute) DRY_RUN=false; shift ;;
    --actor) ACTOR_PREFIX="$2"; shift 2 ;;
    *) echo "Usage: $0 [--execute] [--actor PREFIX]"; exit 1 ;;
  esac
done

echo "============================================"
echo " Agent Rollback — $TABLE"
echo " Actor prefix: $ACTOR_PREFIX"
echo " Mode: $([ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'EXECUTE')"
echo "============================================"
echo ""

# Find agent-created nodes via scan with filter
NODES=$(aws dynamodb scan \
  --table-name "$TABLE" \
  --region "$REGION" \
  --filter-expression "SK = :meta AND begins_with(created_by, :actor)" \
  --expression-attribute-values '{":meta":{"S":"META"},":actor":{"S":"'"$ACTOR_PREFIX"'"}}' \
  --projection-expression "slug,node_type,title,created_at,created_by" \
  --no-cli-pager \
  --query 'Items' --output json 2>&1)

COUNT=$(echo "$NODES" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "Found $COUNT agent-created nodes"
echo ""

if [ "$COUNT" = "0" ]; then
  echo "Nothing to rollback."
  exit 0
fi

# List them
echo "$NODES" | python3 -c "
import json, sys
nodes = json.load(sys.stdin)
for n in nodes:
    slug = n['slug']['S']
    title = n.get('title', {}).get('S', '?')
    actor = n.get('created_by', {}).get('S', '?')
    created = n.get('created_at', {}).get('S', '?')
    print(f'  {slug} — {title} (by {actor}, {created})')
"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "Dry run — no changes made. Use --execute to delete."
  exit 0
fi

echo ""
echo "Deleting..."

echo "$NODES" | python3 -c "
import json, sys, subprocess

nodes = json.load(sys.stdin)
table = '$TABLE'
bucket = '$BUCKET'
region = '$REGION'

for n in nodes:
    slug = n['slug']['S']
    node_type = n.get('node_type', {}).get('S', 'concept')
    pk = f'NODE#{slug}'

    # Delete META
    subprocess.run(['aws', 'dynamodb', 'delete-item', '--table-name', table, '--region', region,
        '--key', json.dumps({'PK': {'S': pk}, 'SK': {'S': 'META'}}), '--no-cli-pager'], capture_output=True)

    # Delete EMBED
    subprocess.run(['aws', 'dynamodb', 'delete-item', '--table-name', table, '--region', region,
        '--key', json.dumps({'PK': {'S': pk}, 'SK': {'S': 'EMBED'}}), '--no-cli-pager'], capture_output=True)

    # Delete outbound edges (query PK = NODE#slug, SK begins_with EDGE#)
    edges = subprocess.run(['aws', 'dynamodb', 'query', '--table-name', table, '--region', region,
        '--key-condition-expression', 'PK = :pk AND begins_with(SK, :edge)',
        '--expression-attribute-values', json.dumps({':pk': {'S': pk}, ':edge': {'S': 'EDGE#'}}),
        '--projection-expression', 'PK,SK', '--no-cli-pager', '--output', 'json'], capture_output=True, text=True)
    for edge in json.loads(edges.stdout).get('Items', []):
        subprocess.run(['aws', 'dynamodb', 'delete-item', '--table-name', table, '--region', region,
            '--key', json.dumps({'PK': edge['PK'], 'SK': edge['SK']}), '--no-cli-pager'], capture_output=True)
        # Delete reverse edge
        rev_pk = 'NODE#' + edge['SK']['S'].replace('EDGE#', '')
        rev_sk = 'EDGE#' + slug
        subprocess.run(['aws', 'dynamodb', 'delete-item', '--table-name', table, '--region', region,
            '--key', json.dumps({'PK': {'S': rev_pk}, 'SK': {'S': rev_sk}}), '--no-cli-pager'], capture_output=True)

    # Delete S3 body
    for lang_suffix in ['body.mdx', 'body.en.mdx']:
        subprocess.run(['aws', 's3', 'rm', f's3://{bucket}/content/{node_type}/{slug}/{lang_suffix}',
            '--region', region], capture_output=True)

    print(f'  ✅ Deleted {slug}')
"

echo ""
echo "Done. $COUNT nodes rolled back."
