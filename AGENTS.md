# AGENTS.md

## Project overview

Serverless backend for a personal knowledge graph on AWS. Implements the architecture from the essay [From Prototype to Production: A Serverless Second Brain on AWS](https://jonmatum.com/essays/from-prototype-to-production-serverless-second-brain).

Three-layer architecture (Interface → Compute → Memory) with two access doors: REST API for humans, MCP Gateway for AI agents. Scales to zero (~$0.51/mo idle).

## Specifications (source of truth)

All contracts are defined in `.kiro/steering/` — read these before writing any code:

| File | Governs |
|---|---|
| `architecture.md` | Three-layer principle, services per layer, cost constraints, phased delivery |
| `dynamodb-schema.md` | Single-table design, item types (META, EDGE, EMBED, AUDIT), GSIs, access patterns |
| `api-spec.md` | REST endpoints — request/response schemas, error codes, auth, rate limits |
| `mcp-tools.md` | MCP tool definitions — JSON Schema inputs, tool→Lambda mapping, write safety rules |
| `event-schemas.md` | Step Functions states, EventBridge rules, SNS message contracts, retry policies |
| `terraform-conventions.md` | Naming, module interfaces, state management, security rules, domain config |
| `code-conventions.md` | TypeScript patterns, Lambda handler structure, error handling, commit conventions |

## Project structure

```
infra/
  bootstrap/              → One-time Terraform state backend (S3 + DynamoDB lock)
  modules/                → Reusable Terraform modules
  environments/
    dev/                  → Dev environment root
    prod/                 → Prod environment root

src/
  functions/
    capture/              → POST /capture — ingest + classify with Bedrock
    search/               → GET /search — hybrid keyword + semantic
    graph/                → GET /graph + GET /nodes/{id} — knowledge graph API
    surfacing/            → Daily digest via EventBridge + SNS
  shared/                 → Shared types, DynamoDB client, error handling, Bedrock client

frontend/                 → Static Next.js export for CloudFront + S3

scripts/                  → Migration, benchmarks, utilities

docs/
  decisions/              → Architecture Decision Records (ADRs)

.kiro/steering/           → SDD specifications (machine-readable contracts)
.github/workflows/        → CI/CD pipelines (GitHub Actions OIDC)
```

## Development approach

**Spec-Driven Development (SDD)**: specifications are written before code and serve as contracts. The steering files define every interface — DynamoDB item shapes, API response formats, MCP tool schemas, event payloads, error codes. Code must conform to these specs.

## Key constraints

- **Cost**: must scale to zero. If a design decision increases idle cost above $1/mo, create an ADR in `docs/decisions/`
- **Auth**: GitHub Actions OIDC for CI/CD — no static AWS credentials
- **Runtime**: Node.js 22.x, TypeScript strict mode for all Lambda functions
- **IaC**: Terraform for all infrastructure, no ClickOps
- **Bilingual**: all content supports Spanish (primary) and English

## Dependency chain

```
#1 Foundation → #2 DynamoDB/S3 → #3 Capture Lambda → #4 API Gateway → #5 Step Functions → #11 Migration
  → #6 Search, #7 Graph, #10 CloudFront (Phase 2)
  → #8 AgentCore, #15 MCP Safety (Phase 3)
  → #9 Surfacing (Phase 4)
  → #12 Benchmarks, #13 Domain Config, #14 Observability (cross-cutting)
```

## Code conventions

- TypeScript strict mode, Node.js 22.x
- ESM modules (`"type": "module"` in package.json)
- Conventional commits: `feat:`, `fix:`, `infra:`, `docs:`, `chore:`
- Lambda handlers follow the pattern in `code-conventions.md`
- Shared code in `src/shared/` — never duplicate DynamoDB client or error types
- All environment variables documented per function in steering files

## Terraform conventions

- Resources named: `{project}-{env}-{service}` (e.g., `ssb-dev-capture`)
- Modules expose `name`, `arn`, and relevant outputs
- State in S3 with DynamoDB lock table (bootstrapped separately)
- No `terraform.tfvars` in git — use environment-specific variable files

## PR instructions

- Run `terraform validate` and `terraform fmt -check` before committing infra changes
- Run `tsc --noEmit` for Lambda code changes
- Title format: `type: description` (conventional commits)
- Reference the GitHub issue number in the PR body
