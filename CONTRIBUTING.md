# Contributing

Thanks for your interest in contributing to Serverless Second Brain.

## Development setup

```bash
git clone https://github.com/jonmatum/serverless-second-brain.git
cd serverless-second-brain

# Lambda code
cd src && npm install

# Terraform
cd infra/environments/dev && terraform init
```

## Before submitting a PR

```bash
# TypeScript
cd src && npx tsc --noEmit

# Terraform
cd infra/environments/dev
terraform fmt -check -recursive
terraform validate
```

## Commit conventions

Format: `type: description (#issue)`

| Type | Use |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `infra:` | Terraform changes |
| `docs:` | Documentation |
| `refactor:` | Code restructuring |
| `chore:` | Maintenance |

## Architecture

Read the specs in `.kiro/steering/` before writing code:

- `architecture.md` — three-layer principle, services, cost constraints
- `dynamodb-schema.md` — single-table design, item types, GSIs
- `api-spec.md` — REST endpoints, request/response schemas
- `code-conventions.md` — TypeScript patterns, error handling

## Adding a new domain configuration

1. Create a `.tfvars` file in `examples/` (see `legal.tfvars` for reference)
2. Set `node_types`, `edge_types`, and surfacing thresholds
3. Test with `terraform plan -var-file=../../examples/your-domain.tfvars`
4. Submit a PR with the example config

## Key constraints

- **Cost**: must scale to zero. If idle cost increases above $1/mo, create an ADR in `docs/decisions/`
- **No static AWS credentials**: use OIDC for CI/CD
- **TypeScript strict mode**: no `any` types
- **Least-privilege IAM**: enumerate specific actions, no wildcards
