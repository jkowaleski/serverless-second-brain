# Quick Start

Deploy your own serverless knowledge graph on AWS.

## Prerequisites

- AWS account with [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) enabled:
  - `us.anthropic.claude-sonnet-4-20250514-v1:0` (classification + content generation)
  - `amazon.titan-embed-text-v2:0` (embeddings)
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [Node.js](https://nodejs.org/) 22.x
- AWS CLI configured with credentials
- [GitHub OIDC provider](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) configured in your AWS account (for CI/CD)

## 1. Bootstrap Terraform state

```bash
git clone https://github.com/YOUR_USER/serverless-second-brain.git
cd serverless-second-brain

cd infra/bootstrap
# Edit main.tf: update github_repo to your fork
terraform init && terraform apply
```

Save the output `github_actions_role_arn` — you'll need it for CI/CD.

## 2. Configure and deploy infrastructure

```bash
cd ../environments/dev
cp ../terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
project_name = "ssb"
digest_email = "you@example.com"
# Update cors_allow_origin and cognito URLs after first deploy
```

```bash
terraform init && terraform apply
```

This creates: DynamoDB, S3, 9 Lambda functions, API Gateway, CloudFront, Cognito, EventBridge, SNS, CloudWatch dashboard.

After apply, note the outputs:
- `api_gateway_invoke_url` — your API endpoint
- `cloudfront_domain` — your frontend URL
- `cognito_user_pool_id`, `cognito_spa_client_id` — for frontend config

## 3. Update URLs after first deploy

Now that you have your CloudFront domain, update `terraform.tfvars`:

```hcl
cors_allow_origin     = "https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net"
cognito_callback_urls = ["http://localhost:5173/callback", "https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net/callback"]
cognito_logout_urls   = ["http://localhost:5173", "https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net"]
```

```bash
terraform apply
```

## 4. Create your user

```bash
cd ../../../
./scripts/create-user.sh you@example.com
```

A temporary password is sent to your email. You'll set a permanent password on first login.

## 5. Build and deploy Lambda code

```bash
cd src && npm install && npx tsc && cd ..

# Deploy all functions
for fn in capture enrich search graph connect flag surfacing authorizer; do
  rm -rf /tmp/lambda-package && mkdir -p /tmp/lambda-package/shared
  cp src/dist/functions/$fn/*.js /tmp/lambda-package/
  cp src/dist/shared/*.js /tmp/lambda-package/shared/
  find /tmp/lambda-package -maxdepth 1 -name '*.js' -exec sed -i '' 's|\.\./\.\./shared/|./shared/|g' {} +
  echo '{"type":"module"}' > /tmp/lambda-package/package.json
  cp -r src/node_modules /tmp/lambda-package/
  cd /tmp/lambda-package && zip -qr /tmp/deploy.zip .
  aws lambda update-function-code --function-name ssb-dev-$fn --zip-file fileb:///tmp/deploy.zip --no-cli-pager
  cd -
done
```

## 6. Build and deploy frontend

```bash
cd frontend && cp .env.example .env
```

Edit `.env` with your Terraform outputs:

```env
VITE_API_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev
VITE_COGNITO_DOMAIN=https://ssb-dev.auth.us-east-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=your_spa_client_id
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
```

```bash
npm install && npm run build && cd ..

aws s3 sync frontend/dist/ s3://ssb-dev-frontend/ --delete
aws s3 cp s3://ssb-dev-frontend/index.html s3://ssb-dev-frontend/index.html \
  --content-type "text/html" --cache-control "no-cache, no-store, must-revalidate" \
  --metadata-directive REPLACE
aws cloudfront create-invalidation --distribution-id $(terraform -chdir=infra/environments/dev output -raw cloudfront_distribution_id) --paths "/*"
```

## 7. Verify

```bash
# Health check
curl $(terraform -chdir=infra/environments/dev output -raw api_gateway_invoke_url)/health

# Graph (public, no auth)
curl $(terraform -chdir=infra/environments/dev output -raw api_gateway_invoke_url)/graph
```

Open your CloudFront URL in a browser, log in with the email from step 4, and capture your first node.

## 8. CI/CD (optional)

1. Add `AWS_ROLE_ARN` as a GitHub repository secret (the ARN from step 1)
2. Push to `main` — Lambda code and frontend deploy automatically
3. Terraform changes require manual apply (or enable auto-apply in `terraform-apply.yml`)

## Cost

Scales to zero. No minimum costs beyond S3 storage.

| Load | Monthly cost |
|---|---|
| Idle | ~$0.51 |
| 100 req/day | ~$2.44 |
| 1,000 req/day | ~$11.21 |

## Tear down

```bash
cd infra/environments/dev && terraform destroy
```
