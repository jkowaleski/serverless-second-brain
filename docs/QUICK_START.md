# Quick Start

Deploy your own serverless knowledge graph on AWS in under 10 minutes.

## Prerequisites

- AWS account with [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) enabled:
  - `us.anthropic.claude-sonnet-4-20250514-v1:0` (classification)
  - `amazon.titan-embed-text-v2:0` (embeddings)
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [Node.js](https://nodejs.org/) 22.x
- AWS CLI configured with credentials

## 1. Clone and bootstrap

```bash
git clone https://github.com/jonmatum/serverless-second-brain.git
cd serverless-second-brain

# Create Terraform state backend (one-time)
cd infra/bootstrap
terraform init && terraform apply
```

## 2. Configure your domain

```bash
cd infra/environments/dev

# Copy the example and customize
cp ../terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
project_name = "my-brain"        # Prefixes all AWS resources
node_types   = ["concept", "note", "experiment", "essay"]
edge_types   = ["related"]
languages    = "en"              # Or "es,en" for bilingual
digest_email = "you@example.com" # Daily digest notifications
```

See `examples/` for domain-specific configs (legal, research).

## 3. Deploy

```bash
terraform init
terraform apply
```

This creates: DynamoDB table, S3 buckets, Lambda functions, API Gateway, Step Functions, EventBridge schedule, SNS topic, CloudWatch dashboard.

## 4. Build and deploy Lambda code

```bash
cd ../../../src
npm install
npx tsc

# Deploy each function (or use CI/CD — see .github/workflows/)
cd ../scripts
./deploy-lambdas.sh  # If available, or deploy manually per function
```

## 5. Verify

```bash
# Get your API URL from Terraform output
cd ../infra/environments/dev
API_URL=$(terraform output -raw api_url)

# Health check
curl $API_URL/health

# Capture your first node
curl -X POST $API_URL/capture \
  -H "Content-Type: application/json" \
  -H "x-api-key: $(terraform output -raw api_key)" \
  -d '{"text": "Serverless architecture eliminates server management by running code in response to events. AWS Lambda, API Gateway, and DynamoDB form the core of most serverless applications on AWS."}'

# Search
curl "$API_URL/search?q=serverless"

# Full graph
curl $API_URL/graph
```

## 6. Optional: CI/CD

The repo includes GitHub Actions workflows for automated deployment:

1. Create an OIDC IAM role (already in `infra/bootstrap/main.tf`)
2. Set `AWS_ROLE_ARN` as a GitHub repository secret
3. Push to `main` — Terraform applies automatically, Lambda code deploys

## Cost

Scales to zero. No minimum costs beyond S3 storage.

| Load | Monthly cost |
|---|---|
| Idle | ~$0.51 |
| 100 req/day | ~$2.44 |
| 1,000 req/day | ~$11.21 |

## Tear down

```bash
# Via GitHub Actions
# Go to Actions → "Destroy Environment" → Run workflow

# Or locally
cd infra/environments/dev
terraform destroy
```
