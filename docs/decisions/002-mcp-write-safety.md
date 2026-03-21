# ADR-002: MCP Write Safety — Quality Controls for Agent Graph Mutations

**Status**: Accepted  
**Date**: 2026-03-21  
**Issue**: [#15](https://github.com/jonmatum/serverless-second-brain/issues/15)

## Context

The essay's community question #2 asks: "Agentes MCP con escritura — la mayoría de implementaciones MCP son de solo lectura. ¿Qué pasa cuando el agente puede mutar el grafo? ¿Qué controles de calidad se necesitan?"

Most MCP implementations are read-only. This system allows agents to create nodes, create edges, and flag content for review. Without controls, an agent could flood the graph with low-quality nodes, create false connections, or degrade the signal-to-noise ratio.

## Decision

We implement a **defense-in-depth** strategy with 6 quality controls at different layers.

### 1. Seed-only creation (Compute layer)

Agent-created nodes always start as `status: seed`. The `persist.ts` step hardcodes `GSI2PK: STATUS#seed` and `status: "seed"` — there is no parameter to override this. Promotion to `growing` or `evergreen` requires human review.

**Rationale**: Prevents agents from injecting content that appears authoritative. Seeds are visually distinct in the frontend and excluded from "trusted" queries.

### 2. Actor attribution (Compute layer)

Every write records `created_by` on the item and `actor` on the audit trail. The MCP server passes `actor: "agent:runtime"` on all write operations. Human API calls default to `"human"`.

This enables:
- Filtering agent-created content in queries
- Measuring agent vs. human quality metrics
- Targeted rollback of agent-created data

### 3. Audit trail with TTL (Memory layer)

Every write operation (create, connect, flag) produces an `AUDIT#` item in DynamoDB with:
- `action`: what happened (create, connect, flag)
- `actor`: who did it (human, agent:runtime, agent:{session_id})
- `changes`: what changed (node_type, status, edge details)
- `ttl`: auto-expires after 90 days

The audit trail enables forensic analysis and rollback without permanent storage cost.

### 4. Rate limiting (MCP server layer)

The MCP server enforces a per-instance write counter (`MAX_WRITES_PER_SESSION`, default: 10). After 10 write operations, subsequent writes return an error. Configurable via environment variable.

**Limitation**: In the current stateless HTTP transport, each request is independent — the counter resets per runtime instance. True per-session limits require session state (DynamoDB or in-memory with sticky sessions). This is acceptable for the current threat model where the runtime is not publicly accessible.

### 5. No delete operations (Architecture layer)

Agents cannot delete nodes or edges. The only destructive action is `flag_stale`, which creates an audit entry but does not modify the node. Deletion is a manual/admin operation via the rollback script or direct DynamoDB access.

### 6. Conditional writes (Memory layer)

`putNode` uses `ConditionExpression: "attribute_not_exists(PK)"` — a DynamoDB conditional write that prevents overwriting existing nodes. Combined with the duplicate check in `classify.ts` (which queries by slug before writing), this provides two layers of duplicate prevention.

## Controls NOT implemented (and why)

### Permission tiers

Different agents with different write levels (e.g., capture-only vs. full mutation). Not implemented because there is currently one agent (the MCP runtime). When #17 (OAuth/Cognito) lands, permission tiers can be mapped to OAuth scopes.

### Approval queue

Agent-created content going through a review queue before becoming visible. Not implemented because `seed` status already serves this purpose — seeds are visible but clearly marked as unreviewed. A formal queue would add complexity without proportional benefit at current scale.

### Conflict resolution

Optimistic locking with version numbers for concurrent edits. Not implemented because the system has no UPDATE endpoint — nodes are created once and promoted manually. The conditional write on `putNode` prevents the only conflict scenario (duplicate creation).

### Token-based budgets

Per-day or per-month write budgets tied to Bedrock token consumption. Not implemented because the rate limiter is sufficient at current scale, and Bedrock costs are tracked via CloudWatch (issue #14). Can be added if agent usage grows significantly.

## Rollback procedure

`scripts/rollback-agent.sh` queries the audit trail for agent-created nodes and deletes them:

```bash
# Dry run — shows what would be deleted
./scripts/rollback-agent.sh

# Execute deletion
./scripts/rollback-agent.sh --execute

# Target specific actor
./scripts/rollback-agent.sh --actor "agent:runtime" --execute
```

The script deletes: META item, EMBED item, outbound edges, reverse edges, and S3 body files.

## Quality metrics to track

For future experiments (when agent usage begins):

| Metric | How to measure |
|---|---|
| Agent node promotion rate | % of agent-created seeds promoted to growing/evergreen |
| False connection rate | % of agent-created edges later deleted by humans |
| Noise ratio | Agent nodes flagged as stale / total agent nodes |
| Bedrock cost per agent write | CloudWatch Bedrock metrics filtered by agent invocations |

## References

- [MCP Specification — Security considerations](https://modelcontextprotocol.io/specification/latest)
- `.kiro/steering/mcp-tools.md` — Write safety rules section
- `.kiro/steering/dynamodb-schema.md` — AUDIT item schema
