#!/usr/bin/env bash
# Create the initial Cognito user for the knowledge graph owner.
# Usage: ./scripts/create-user.sh <email> [environment]
set -euo pipefail

EMAIL="${1:?Usage: $0 <email> [environment]}"
ENV="${2:-dev}"
PROJECT="ssb"
REGION="us-east-1"

POOL_ID=$(aws ssm get-parameter \
  --name "/${PROJECT}/${ENV}/cognito/user-pool-id" \
  --query "Parameter.Value" --output text \
  --region "$REGION" 2>/dev/null) || {
  echo "Error: SSM parameter not found. Run 'terraform apply' first."
  exit 1
}

echo "Creating user ${EMAIL} in pool ${POOL_ID}..."

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --region "$REGION" \
  --no-cli-pager

echo ""
echo "User created. A temporary password was sent to ${EMAIL}."
echo "Log in at your frontend URL — you'll be prompted to set a permanent password."
