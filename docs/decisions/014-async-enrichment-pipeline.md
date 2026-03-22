# ADR-014: Async Enrichment Pipeline — Split Capture into Sync + Async

## Status

Accepted

## Context

The capture Lambda runs synchronously behind API Gateway (30s timeout). It currently does everything in one request:

1. Classify text with Bedrock Claude (~8-15s)
2. Generate full bilingual body content (~included in classify)
3. Persist META to DynamoDB
4. Write body to S3 (ES + EN)
5. Create edges
6. Generate embedding with Bedrock Titan
7. Persist embedding

Steps 1-2 are the bottleneck — Bedrock generates ~400-600 words × 2 languages plus metadata in a single `max_tokens: 4096` call. This regularly takes 10-20s, leaving little margin for DynamoDB/S3 writes.

Adding a content growth pipeline (seed → growing → evergreen) would require deeper Bedrock analysis that cannot fit in the 30s window.

The previous attempt at async processing (ADR-006, Step Functions Express) was over-engineered — 4 separate Lambdas, a state machine, and complex error handling for what is fundamentally a two-phase problem.

## Decision

Split capture into two phases:

### Phase 1 — Sync (capture Lambda, <5s target)

Bedrock classifies metadata only (title, summaries, tags, type, concepts). Small prompt, `max_tokens: 1024`. Writes META to DynamoDB immediately. Returns 201 to the user.

After META write, invokes the enrich Lambda asynchronously via Lambda `InvokeCommand` with `InvocationType: "Event"` (fire-and-forget). No EventBridge needed — direct async invocation is simpler and still scales to zero.

### Phase 2 — Async (enrich Lambda, no timeout pressure)

Receives slug + original text + metadata. Generates full bilingual body content with a dedicated body-generation prompt (`max_tokens: 4096`). Writes body to S3, generates embedding, persists embedding, creates edges. Updates META with word counts.

### Why not EventBridge?

Direct async Lambda invocation (`InvocationType: "Event"`) is simpler:
- No EventBridge rule or bus to manage
- Built-in retry (2 automatic retries on failure)
- Same cost ($0)
- One fewer infrastructure component

### Frontend behavior

- Capture returns immediately with title + summary (no body yet)
- Node page shows summary while body loads
- Body appears on next page visit (typically seconds later)

## Consequences

### Positive

- Capture responds in <5s instead of 10-20s
- No API Gateway timeout risk
- Body generation can use larger `max_tokens` without time pressure
- Foundation for content growth pipeline (growing/evergreen promotion)
- Simpler than SFN — just two Lambdas, one async call

### Negative

- Body not immediately available after capture (seconds delay)
- Need to handle the case where enrichment fails (node exists without body)
- Two Bedrock calls per capture instead of one (slightly higher cost per capture, but classify call is much cheaper with fewer tokens)

### Cost impact

- Classify call: ~$0.005 (small prompt, 1024 tokens max)
- Enrich call: ~$0.022 (body generation, 4096 tokens max)
- Total: ~$0.027 (same as before, just split across two calls)
- Idle cost: unchanged ($0)

## Implementation

1. New `classify-only` prompt in `bedrock.ts` — metadata only, no body
2. New `enrich` Lambda — body generation + embedding + edges
3. Capture Lambda invokes enrich async after META write
4. Terraform: new Lambda module for enrich, IAM permissions
5. Frontend: handle nodes without body gracefully
