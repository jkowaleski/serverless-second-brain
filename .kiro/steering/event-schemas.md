---
inclusion: always
---

# Event Schemas — Async Flows

This file defines the exact schemas for all asynchronous events in the system: EventBridge events and SNS messages.

> **Note**: Step Functions were removed in the DRY cleanup (2026-03-22). The capture pipeline now runs as a monolithic Lambda handler. See [ADR-006](../../docs/decisions/006-step-functions-express-capture-pipeline.md) for history.

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
- Published by: Capture Lambda (on successful node creation)

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
    "summary": "...",
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
