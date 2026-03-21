---
inclusion: always
---

# DynamoDB Schema — Single-Table Design

This file defines the exact schema for the DynamoDB knowledge graph table. All code that reads or writes to DynamoDB MUST conform to this schema.

## Table configuration

- Table name: `{project_name}-{env}-knowledge-graph`
- Billing mode: PAY_PER_REQUEST
- Hash key: `PK` (String)
- Range key: `SK` (String)
- Point-in-time recovery: enabled
- Encryption: AWS-managed KMS

## Access patterns → Key design

| Access pattern | Key condition | Index |
|---|---|---|
| Get node metadata | PK = `NODE#{slug}`, SK = `META` | Table |
| Get node edges (outbound) | PK = `NODE#{slug}`, SK begins_with `EDGE#` | Table |
| Get node embedding | PK = `NODE#{slug}`, SK = `EMBED` | Table |
| Get all data for a node | PK = `NODE#{slug}` | Table |
| Get inbound edges (what points to X?) | SK = `EDGE#{slug}`, scan PK | GSI1 |
| Get nodes by status | GSI2 PK = `STATUS#{status}` | GSI2 |
| Get audit trail for a node | SK = `NODE#{slug}`, PK begins_with `AUDIT#` | GSI1 |

## GSIs

### GSI1 — Inverted index

- Hash key: `SK`
- Range key: `PK`
- Projection: ALL

### GSI2 — Status index

- Hash key: `GSI2PK` (value: `STATUS#{status}`)
- Range key: `updated_at`
- Projection: KEYS_ONLY + `node_type`, `title`, `slug`

## Item types

### META item

```json
{
  "PK": "NODE#serverless",
  "SK": "META",
  "GSI2PK": "STATUS#evergreen",
  "slug": "serverless",
  "node_type": "concept",
  "status": "seed | growing | evergreen",
  "title": "Serverless",
  "title_es": "Serverless",
  "title_en": "Serverless",
  "summary_es": "...",
  "summary_en": "...",
  "tags": ["aws", "lambda", "cloud"],
  "created_at": "2026-03-19T10:30:00Z",
  "updated_at": "2026-03-19T10:30:00Z",
  "created_by": "human | agent",
  "word_count_es": 1200,
  "word_count_en": 1100,
  "visibility": "public | private"
}
```

Required fields: `PK`, `SK`, `slug`, `node_type`, `status`, `title`, `title_es`, `title_en`, `summary_es`, `summary_en`, `tags`, `created_at`, `updated_at`.

### EDGE item

```json
{
  "PK": "NODE#serverless",
  "SK": "EDGE#aws-lambda",
  "edge_type": "related",
  "weight": 1.0,
  "created_at": "2026-03-19T10:30:00Z",
  "created_by": "human | agent"
}
```

Required fields: `PK`, `SK`, `edge_type`, `created_at`.

Valid `edge_type` values are domain-configurable. Defaults: `related`.

### EMBED item

```json
{
  "PK": "NODE#serverless",
  "SK": "EMBED",
  "model": "amazon.titan-embed-text-v2:0",
  "dimensions": 1024,
  "vector": [0.123, -0.456, ...],
  "source_text": "title + summary_es + summary_en + tags",
  "generated_at": "2026-03-19T10:30:00Z"
}
```

Required fields: `PK`, `SK`, `model`, `dimensions`, `vector`, `generated_at`.

Vector is stored as a list of numbers (DynamoDB List type). 1,024 floats ≈ 8KB per item.

### AUDIT item

```json
{
  "PK": "AUDIT#2026-03-19T10:30:00Z",
  "SK": "NODE#serverless",
  "action": "create | update | connect | flag",
  "actor": "human | agent:{session_id}",
  "changes": { "status": { "old": "seed", "new": "growing" } },
  "ttl": 1729382400
}
```

Required fields: `PK`, `SK`, `action`, `actor`, `changes`.

TTL: 90 days from creation (Unix timestamp). DynamoDB auto-deletes expired items.

## S3 content bucket

- Bucket name: `{project_name}-{env}-content`
- Key pattern: `content/{node_type}/{slug}/body.mdx` (Spanish)
- Key pattern: `content/{node_type}/{slug}/body.en.mdx` (English)
- Versioning: enabled
- Encryption: SSE-S3
- Lifecycle: old versions → Glacier after 90 days

## Validation rules

- `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase, hyphens only)
- `node_type` must be one of the configured types (default: `concept`, `note`, `experiment`, `essay`)
- `status` must be one of: `seed`, `growing`, `evergreen`
- `tags` must be a non-empty array of strings
- `edge_type` must be one of the configured types
- `vector` must have exactly `dimensions` elements
- `created_at` and `updated_at` must be ISO 8601 timestamps
