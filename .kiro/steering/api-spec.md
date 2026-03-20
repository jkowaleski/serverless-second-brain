---
inclusion: always
---

# API Specification — REST Endpoints

This file defines the exact contract for all REST API endpoints. All Lambda handlers and API Gateway configurations MUST conform to this spec.

## Base URL

- Dev: `https://{api-id}.execute-api.{region}.amazonaws.com/dev`
- Prod: `https://api.{custom-domain}`

## Authentication

- Read endpoints (`GET`): no auth required
- Write endpoints (`POST`): API key required via `x-api-key` header
- Service-to-service: IAM authorization (SigV4)

## Endpoints

### POST /capture

Creates a new knowledge node. Triggers the Step Functions capture pipeline.

**Request**:
```json
{
  "text": "string (required, min 50 chars)",
  "url": "string (optional, valid URL)",
  "type": "string (optional, default: 'concept')",
  "language": "string (optional, 'es' | 'en', default: 'es')"
}
```

**Response 201**:
```json
{
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
  "concepts": ["aws-lambda", "aws-api-gateway"],
  "created_at": "2026-03-19T10:30:00Z",
  "updated_at": "2026-03-19T10:30:00Z"
}
```

**Error 400**: `{ "error": "validation_error", "message": "text is required and must be at least 50 characters" }`
**Error 409**: `{ "error": "duplicate_slug", "message": "Node with slug 'serverless' already exists" }`
**Error 429**: `{ "error": "rate_limited", "message": "Too many requests" }`
**Error 503**: `{ "error": "bedrock_unavailable", "message": "AI classification service temporarily unavailable" }`

Auth: API key required.

### GET /search

Hybrid keyword + semantic search across the knowledge graph.

**Query parameters**:
- `q` (required): search query string
- `limit` (optional, default: 10, max: 50): number of results
- `type` (optional): filter by node type
- `status` (optional): filter by status

**Response 200**:
```json
{
  "query": "serverless event-driven",
  "results": [
    {
      "id": "serverless",
      "title": "Serverless",
      "title_es": "Serverless",
      "title_en": "Serverless",
      "summary_es": "...",
      "summary_en": "...",
      "node_type": "concept",
      "status": "evergreen",
      "tags": ["aws", "lambda"],
      "score": 0.92,
      "score_keyword": 0.85,
      "score_semantic": 0.95
    }
  ],
  "total": 1,
  "took_ms": 120
}
```

**Error 400**: `{ "error": "validation_error", "message": "q parameter is required" }`

Auth: none.

### GET /graph

Returns the full knowledge graph (nodes + edges) for D3 visualization.

**Query parameters**:
- `type` (optional): filter nodes by type
- `status` (optional): filter nodes by status

**Response 200**:
```json
{
  "nodes": [
    {
      "id": "serverless",
      "title": "Serverless",
      "node_type": "concept",
      "status": "evergreen",
      "tags": ["aws", "lambda"],
      "edge_count": 5
    }
  ],
  "edges": [
    {
      "source": "serverless",
      "target": "aws-lambda",
      "edge_type": "related",
      "weight": 1.0
    }
  ],
  "meta": {
    "node_count": 160,
    "edge_count": 450,
    "generated_at": "2026-03-19T10:30:00Z"
  }
}
```

Auth: none. Cache: 5-minute TTL.

### GET /nodes/{id}

Returns a single node with its metadata, edges, and related nodes.

**Path parameters**:
- `id` (required): node slug

**Response 200**:
```json
{
  "node": {
    "id": "serverless",
    "title": "Serverless",
    "title_es": "Serverless",
    "title_en": "Serverless",
    "summary_es": "...",
    "summary_en": "...",
    "node_type": "concept",
    "status": "evergreen",
    "tags": ["aws", "lambda"],
    "created_at": "2026-03-19T10:30:00Z",
    "updated_at": "2026-03-19T10:30:00Z",
    "word_count_es": 1200,
    "word_count_en": 1100
  },
  "edges": [
    { "target": "aws-lambda", "edge_type": "related", "weight": 1.0 }
  ],
  "related": [
    { "id": "aws-lambda", "title": "AWS Lambda", "node_type": "concept", "status": "evergreen" }
  ]
}
```

**Error 404**: `{ "error": "not_found", "message": "Node 'nonexistent' not found" }`

Auth: none.

### GET /health

Health check endpoint. No Lambda invocation (API Gateway mock integration).

**Response 200**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-03-19T10:30:00Z"
}
```

Auth: none.

## Common headers

All responses include:
- `Content-Type: application/json`
- `X-Request-Id: {uuid}` (for tracing)
- CORS headers: `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`

## Rate limits

| Endpoint | Burst | Sustained |
|---|---|---|
| POST /capture | 10 req/s | 5 req/s |
| GET /search | 100 req/s | 50 req/s |
| GET /graph | 100 req/s | 50 req/s |
| GET /nodes/{id} | 100 req/s | 50 req/s |
