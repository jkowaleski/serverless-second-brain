---
inclusion: always
---

# Architecture — Serverless Second Brain

This file is the source of truth for the system architecture. Every implementation decision must align with this spec. Derived from the essay "From Prototype to Production: A Serverless Second Brain on AWS."

## Three-layer principle

The system separates into three layers. Each layer can evolve independently.

```
Interface → Compute → Memory
```

- **Interface**: how humans and agents access the system
- **Compute**: what the system does with requests
- **Memory**: where data lives

No layer may bypass another. Interface never talks directly to Memory.

## Services per layer

### Memory layer

| Service | Role | Key constraint |
|---|---|---|
| DynamoDB | Metadata, edges, embeddings, audit trail | Single-table design, PAY_PER_REQUEST |
| S3 (content) | Long-form MDX body (ES + EN) | Versioning enabled, SSE-S3 |

### Compute layer

| Service | Role | Key constraint |
|---|---|---|
| Lambda Capture | Ingest text → classify → persist | 512 MB, 30s timeout, Node.js 22.x |
| Lambda Search | Hybrid keyword + semantic search | Reads DynamoDB + Bedrock Titan |
| Lambda Graph | Build and serve knowledge graph JSON | Reads DynamoDB, caches in memory |
| Lambda Surfacing | Daily analysis of graph health | Triggered by EventBridge, writes to SNS |
| Step Functions | Orchestrate multi-step capture pipeline | Express Workflow for sync, Standard for async |
| EventBridge | Schedule daily surfacing cron | `cron(0 8 * * ? *)` |
| Bedrock Claude | Classification, metadata generation, agent reasoning | `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| Bedrock Titan | Embeddings (1,024 dimensions) | `amazon.titan-embed-text-v2:0` |
| AgentCore Runtime | Host reasoning agent in microVMs | Session isolation, tool access via Gateway |

### Interface layer

| Service | Role | Key constraint |
|---|---|---|
| API Gateway REST | Human door — SPA and external clients | Throttling, Cognito JWT for writes, CORS |
| AgentCore Gateway | Agent door — MCP tools | OAuth, semantic discovery, protocol translation |
| CloudFront + S3 | Static frontend (Next.js export) | OAC, security headers, cache policies |

## Two doors

- **Human door**: CloudFront → SPA + API Gateway REST (search, graph, capture)
- **Agent door**: AgentCore Gateway → MCP tools (read_node, add_node, connect_nodes, search, flag_stale, list_nodes)

Both doors use the same Lambda functions. The difference is protocol and auth.

## Cost constraint

The system MUST scale to zero. No minimum costs beyond S3 storage (~$0.50/mo).

| Load | Target cost |
|---|---|
| Idle (0 req/day) | ~$0.51/mo |
| Moderate (100 req/day) | ~$2.44/mo |
| High (1,000 req/day) | ~$11.21/mo |

If a design decision increases idle cost above $1/mo, it requires an ADR in `docs/decisions/`.

## Phased delivery

Each phase is independently deployable and adds value without requiring subsequent phases.

- **Phase 1**: Capture API (Lambda + API Gateway + DynamoDB + S3 + Step Functions)
- **Phase 2**: Search + Graph + Frontend (Search Lambda + Graph Lambda + CloudFront)
- **Phase 3**: Agent door (AgentCore Gateway + Runtime + MCP tools)
- **Phase 4**: Proactive surfacing (EventBridge + Surfacing Lambda + SNS)

## Design notes

### Extensions beyond the essay

The following were added during specification but are not in the original essay:

- **`list_nodes` MCP tool**: the essay lists 5 tools (read_node, add_node, connect_nodes, search, flag_stale). `list_nodes` was added as a natural read operation — agents need to browse/filter nodes, not just search or read by slug.
- **`GET /health` endpoint**: standard operational endpoint not in the essay but required for monitoring and load balancer health checks.
- **Observability (issue #14)**: the essay implies CloudWatch logging throughout but doesn't consolidate it. Added as a cross-cutting concern with dashboards, alarms, X-Ray tracing, and cost tracking.

### Intentional omissions

- **No UPDATE endpoint**: the system has no PUT/PATCH for modifying existing node metadata. Updates to existing content happen through the jonmatum.com MDX workflow (git commits). The serverless backend is optimized for capture (create) and read — not editing. The AUDIT item schema supports `action: "update"` for future use if needed.
- **No DELETE operations**: agents and API clients cannot delete nodes or edges. Deletion is a manual/admin operation. Agents can only `flag_stale` for human review.
- **WAF**: intentionally deferred. Can be added to API Gateway and CloudFront later without architectural changes.
- **Edge functions**: intentionally deferred. CloudFront Functions or Lambda@Edge can be added for A/B testing or personalization later.

### `connect_nodes` routing decision

`connect_nodes` is routed to the Capture Lambda (not Graph Lambda) because:
1. It's a write operation — Capture Lambda already has DynamoDB write permissions and audit trail logic
2. Graph Lambda is read-only by design — adding write paths would violate single responsibility
3. Edge creation may trigger Bedrock to validate the relationship (future enhancement)

### Cost baseline (per-service breakdown from essay)

For observability comparison (issue #14):

| Service | Idle | Moderate (100 req/day) | High (1,000 req/day) |
|---|---|---|---|
| DynamoDB on-demand | $0.00 | ~$0.25 | ~$2.50 |
| Lambda | $0.00 | ~$0.01 | ~$0.10 |
| API Gateway | $0.00 | ~$0.04 | ~$0.35 |
| S3 + CloudFront | ~$0.50 | ~$0.60 | ~$1.00 |
| Bedrock (embeddings) | $0.00 | ~$0.50 | ~$2.00 |
| Bedrock (chat/agent) | $0.00 | ~$1.00 | ~$5.00 |
| EventBridge + SNS | ~$0.01 | ~$0.01 | ~$0.01 |
| Step Functions | $0.00 | ~$0.03 | ~$0.25 |
