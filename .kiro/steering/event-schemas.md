---
inclusion: always
---

# Event Schemas — Async Flows

This file defines the exact schemas for all asynchronous events in the system: EventBridge events, SNS messages, and Step Functions state transitions.

## Step Functions — Capture pipeline

### Input (from API Gateway)

```json
{
  "text": "string",
  "url": "string | null",
  "type": "string",
  "language": "es | en",
  "request_id": "uuid"
}
```

### State transitions

```
ValidateInput → GenerateMetadata → PersistNode → CreateEdges → NotifySuccess
```

Note: `ComputeEmbeddings` step is deferred to Phase 2 (Search Lambda, #6). The pipeline will be extended to include it between GenerateMetadata and PersistNode once Bedrock Titan embedding infrastructure exists.

Each state passes its output as input to the next. Intermediate payloads:

**ValidateInput → GenerateMetadata**:
```json
{
  "input": {
    "text": "...",
    "url": "...",
    "type": "concept",
    "language": "es"
  },
  "existingSlugs": ["aws-lambda", "serverless", "..."]
}
```

**GenerateMetadata → PersistNode**:
```json
{
  "input": { "text": "...", "type": "concept", "language": "es" },
  "metadata": {
    "title": "Serverless",
    "title_es": "Serverless",
    "title_en": "Serverless",
    "summary_es": "...",
    "summary_en": "...",
    "tags": ["aws", "lambda"],
    "concepts": ["aws-lambda"]
  },
  "slug": "serverless"
}
```

**PersistNode → CreateEdges**:
```json
{
  "input": { "text": "...", "type": "concept", "language": "es" },
  "metadata": { "..." },
  "slug": "serverless",
  "now": "2026-03-19T10:30:00Z"
}
```

### Retry policy

- GenerateMetadata: retry 3 times, backoff 2s/4s/8s, on `BedrockError`
- PersistNode: retry 2 times, backoff 1s/2s, on `States.TaskFailed`

### Error output

```json
{
  "error": "StepFailed",
  "step": "GenerateMetadata",
  "cause": "ThrottlingException: Rate exceeded",
  "request_id": "uuid"
}
```

## EventBridge — Surfacing schedule

### Rule

- Name: `{project_name}-{env}-daily-surfacing`
- Schedule: `cron(0 8 * * ? *)`
- Target: Surfacing Lambda

### Event payload (EventBridge → Lambda)

```json
{
  "source": "secondbrain.scheduler",
  "detail-type": "DailySurfacing",
  "detail": {
    "run_id": "uuid",
    "triggered_at": "2026-03-19T08:00:00Z"
  }
}
```

## SNS — Notifications

### Topic: Capture complete

- Name: `{project_name}-{env}-capture-complete`
- Published by: Step Functions NotifySuccess state

The message wraps the full pipeline output (CaptureResponse) under `detail`:

```json
{
  "source": "capture-pipeline",
  "detail": {
    "id": "serverless",
    "slug": "serverless",
    "node_type": "concept",
    "status": "seed",
    "title": "Serverless",
    "title_es": "Serverless",
    "title_en": "Serverless",
    "summary_es": "...",
    "summary_en": "...",
    "tags": ["aws", "lambda"],
    "concepts": ["aws-lambda"],
    "created_at": "2026-03-19T10:30:00Z",
    "updated_at": "2026-03-19T10:30:00Z"
  }
}
```

### Topic: Daily digest

- Name: `{project_name}-{env}-daily-digest`
- Published by: Surfacing Lambda
- Subscribers: email (owner)

```json
{
  "event": "daily_digest",
  "run_id": "uuid",
  "generated_at": "2026-03-19T08:05:00Z",
  "findings": {
    "stale_seeds": [
      { "slug": "container-registries", "days_stale": 14 }
    ],
    "orphan_nodes": [
      { "slug": "aws-sqs", "edge_count": 1 }
    ],
    "missing_connections": [
      { "source": "serverless", "target": "cost-optimization", "similarity": 0.91 }
    ],
    "promotion_candidates": [
      { "slug": "aws-bedrock", "word_count": 1200, "ref_count": 5, "edge_count": 4 }
    ],
    "content_gaps": [
      { "tag": "mcp", "occurrences": 8, "has_concept": false }
    ]
  },
  "summary": {
    "stale_seeds": 3,
    "orphan_nodes": 1,
    "missing_connections": 2,
    "promotion_candidates": 1,
    "content_gaps": 1
  }
}
```

## Surfacing thresholds (configurable)

| Check | Default threshold |
|---|---|
| Stale seed | `updated_at` > 7 days ago |
| Orphan node | edge_count < 2 |
| Missing connection | embedding similarity > 0.85 AND no edge exists |
| Promotion candidate | status = seed AND word_count >= 400 AND ref_count >= 3 |
| Content gap | tag occurrences >= 5 AND no concept node with that slug |
