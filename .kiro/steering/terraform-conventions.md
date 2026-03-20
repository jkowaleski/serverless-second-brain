---
inclusion: always
---

# Terraform Conventions

This file governs all Terraform code in this project. Every module, resource, and variable MUST follow these conventions.

## Project structure

```
infra/
  bootstrap/               → One-time Terraform state backend (S3 + DynamoDB lock)
  environments/
    dev/main.tf            → Instantiates modules with dev values
    dev/variables.tf       → Dev-specific variable declarations
    dev/outputs.tf         → Dev outputs
    dev/terraform.tfvars   → Dev values (not committed for secrets)
    prod/                  → Same structure
  modules/
    dynamodb/              → Knowledge graph table + GSIs
    s3/                    → Content bucket + frontend bucket
    lambda/                → Reusable Lambda function module
    api-gateway/           → REST API + routes + stages
    step-functions/        → State machine definitions
    eventbridge/           → Scheduler rules
    sns/                   → Topics + subscriptions
    cloudfront/            → Distribution + OAC + headers
    agentcore/             → Gateway + Runtime + tool registrations
    iam/                   → Roles + policies
    monitoring/            → Dashboards + alarms + X-Ray
  backend.tf               → S3 backend configuration
  providers.tf             → AWS provider + version constraints
  versions.tf              → Required provider versions
```

## Naming convention

All AWS resources use the pattern: `{project_name}-{environment}-{resource}`

- `project_name`: from `var.project_name` (default: `ssb`)
- `environment`: from `var.environment` (default: `dev`)
- Example: `ssb-dev-knowledge-graph`, `ssb-dev-capture`

## Module interface rules

Every module MUST have:
- `variables.tf` with descriptions and types for all inputs
- `outputs.tf` exposing ARN, name, and any IDs needed by other modules
- `main.tf` with the resource definitions
- Tags on every resource: `Project`, `Environment`, `ManagedBy: terraform`

Every variable MUST have:
- `description` — what it does
- `type` — explicit type constraint
- `default` — where sensible (no default for secrets or environment-specific values)
- `validation` block — for constrained values (e.g., status, node types)

## State management

- Backend: S3 bucket with versioning + DynamoDB table for locking
- Key pattern: `{project_name}/{environment}/terraform.tfstate`
- Bootstrap: `infra/bootstrap/` — separate Terraform root that creates the backend resources (S3 bucket + DynamoDB lock table). Run once before `terraform init` in environment roots.

## Security rules

- No hardcoded secrets — use SSM Parameter Store or Secrets Manager
- IAM policies use least-privilege — enumerate specific actions, not wildcards
- Lambda execution roles are per-function, not shared
- S3 buckets block public access by default
- DynamoDB encryption enabled (AWS-managed KMS)
- CloudFront uses OAC, not OAI

## Domain configuration variables

These variables make the system domain-agnostic:

```hcl
variable "project_name" {
  description = "Project name, prefixes all resources"
  type        = string
  default     = "ssb"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
  }
}

variable "node_types" {
  description = "Valid knowledge node types"
  type        = list(string)
  default     = ["concept", "note", "experiment", "essay"]
}

variable "edge_types" {
  description = "Valid edge relationship types"
  type        = list(string)
  default     = ["related"]
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for classification and reasoning"
  type        = string
  default     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
}

variable "bedrock_embedding_model_id" {
  description = "Bedrock model ID for embeddings"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "agent_system_prompt" {
  description = "System prompt for the AgentCore Runtime agent"
  type        = string
  default     = ""  # Loaded from file if empty
}
```

## CI/CD

- `terraform-plan.yml`: runs on PRs, posts plan output as PR comment
- `terraform-apply.yml`: runs on merge to main (dev auto-apply, prod manual approval)
- Authentication: GitHub Actions OIDC → AWS IAM Role (no static secrets)
- Lambda packaging: `lambda-deploy.yml` zips and uploads to S3, then updates Lambda
