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
  runtime/                → Python MCP server for AgentCore Runtime
  shared/                 → Shared types, DynamoDB client, error handling, Bedrock client

frontend/                 → Static Next.js export for CloudFront + S3

scripts/
  smoke-test.sh           → 13-check end-to-end validation
  benchmark-dynamodb.sh   → DynamoDB latency benchmark
  rollback-agent.sh       → Rollback agent-created nodes (dry-run by default)

docs/
  benchmarks/results.md   → Real performance and cost data
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

## MCP write safety

Agent writes go through 6 quality controls (see [ADR-002](docs/decisions/002-mcp-write-safety.md)):

1. **Seed-only** — agent-created nodes always start as `seed`, no override
2. **Actor attribution** — `created_by: "agent:runtime"` on all items + audit trail
3. **Audit trail** — `AUDIT#` items with 90-day TTL on every write
4. **Rate limiting** — 10 writes per runtime instance (`MAX_WRITES_PER_SESSION`)
5. **No deletes** — agents can only `flag_stale`, not delete
6. **Conditional writes** — `attribute_not_exists(PK)` prevents overwrites

Rollback: `./scripts/rollback-agent.sh` (dry-run by default, `--execute` to delete)

## Architecture decisions

| ADR | Decision |
|---|---|
| [001](docs/decisions/001-lambda-packaging-and-framework.md) | Lambda packaging and framework |
| [002](docs/decisions/002-mcp-write-safety.md) | MCP write safety — 6 quality controls for agent mutations |
| [003](docs/decisions/003-authentication-and-visibility.md) | Authentication (Cognito) and content visibility (public/private) |

## Performance and cost

Real data at 178 nodes: [`docs/benchmarks/results.md`](docs/benchmarks/results.md)

- **DynamoDB**: single node read 344ms, full graph scan 488ms. Scan becomes impractical at ~5K nodes.
- **Search**: DynamoDB scan + cosine similarity at $0 idle. Crossover to pgvector at ~5K nodes.
- **Bedrock**: $0.027/classify (Claude Sonnet 4), $0.000014/search (Titan Embed). High input tokens from slug list in prompt — optimize at scale.

## Dependency chain

```
#1 Foundation → #2 DynamoDB/S3 → #3 Capture Lambda → #4 API Gateway → #5 Step Functions → #11 Migration
  → #6 Search, #7 Graph, #10 CloudFront (Phase 2)
  → #8 AgentCore, #15 MCP Safety (Phase 3)
  → #9 Surfacing (Phase 4)
  → #12 Benchmarks, #13 Domain Config, #14 Observability (cross-cutting)
```

All issues above are closed. Open: #17 (OAuth/Cognito), #18 (Reasoning agent).

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
