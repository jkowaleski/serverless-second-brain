---
inclusion: always
---

# Code Conventions

This file governs all application code (Lambda functions, scripts, utilities) in this project.

## Language and runtime

- Lambda functions: Node.js 22.x (TypeScript, compiled to JS)
- Scripts (migration, benchmarks): TypeScript via tsx or Python 3.12
- Terraform: HCL

## Project structure for Lambda code

```
src/
  shared/
    types.ts          → Shared TypeScript types (DynamoDB items, API responses)
    dynamodb.ts       → DynamoDB client + helpers (getNode, putNode, queryEdges, getCacheVersion)
    s3.ts             → S3 client + helpers (getBody, putBody)
    bedrock.ts        → Bedrock client + helpers (classify, embed)
    validation.ts     → Input validation (slug format, required fields)
    errors.ts         → Error types (ValidationError, NotFoundError, DuplicateError)
    http.ts           → CORS headers + JSON/error response helpers
    math.ts           → cosine similarity, auditTtl
    keys.ts           → DynamoDB key prefix helpers (nodeKey, edgeKey, etc.)
    auth.ts           → JWT verification helpers
  functions/
    capture/
      handler.ts      → Monolithic Lambda entry point (validate → classify → persist → edges)
      index.ts        → Export handler
    search/
      handler.ts      → Lambda entry point
      index.ts
    graph/
      handler.ts      → Lambda entry point
      index.ts
    surfacing/
      handler.ts      → Lambda entry point
      analyzers/      → One file per analysis type
      digest.ts       → Compile findings into digest
      index.ts
```

## TypeScript rules

- Strict mode enabled
- No `any` — use explicit types from `shared/types.ts`
- All DynamoDB items typed against the schema in `dynamodb-schema.md`
- All API responses typed against the spec in `api-spec.md`
- All event payloads typed against the schemas in `event-schemas.md`
- Use `@aws-sdk/client-*` v3 (not v2)
- Prefer `const` over `let`, never use `var`

## Error handling

Every Lambda handler follows this pattern:

```typescript
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // business logic
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { statusCode: 400, body: JSON.stringify({ error: 'validation_error', message: error.message }) };
    }
    if (error instanceof NotFoundError) {
      return { statusCode: 404, body: JSON.stringify({ error: 'not_found', message: error.message }) };
    }
    if (error instanceof DuplicateError) {
      return { statusCode: 409, body: JSON.stringify({ error: 'duplicate_slug', message: error.message }) };
    }
    console.error('Unhandled error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'internal_error', message: 'Internal server error' }) };
  }
};
```

## Environment variables

Lambda functions receive configuration via environment variables:

| Variable | Used by | Description |
|---|---|---|
| `TABLE_NAME` | All | DynamoDB table name |
| `BUCKET_NAME` | Capture, Graph | S3 content bucket name |
| `BEDROCK_MODEL_ID` | Capture | Claude model ID for classification |
| `BEDROCK_EMBEDDING_MODEL_ID` | Capture, Search | Titan model ID for embeddings |
| `CORS_ALLOW_ORIGIN` | Search, Graph | CORS allowed origin (dev: `*`, prod: `https://jonmatum.com`) |
| `SNS_DIGEST_TOPIC_ARN` | Surfacing | SNS topic for daily digest |
| `ENVIRONMENT` | All | `dev` or `prod` |
| `DEFAULT_VISIBILITY` | Capture | Default visibility for new nodes (`public` or `private`) |
| `USER_POOL_ID` | Authorizer, Graph, Search | Cognito User Pool ID for JWT verification |
| `SPA_CLIENT_ID` | Authorizer, Graph, Search | Cognito SPA app client ID |
| `MCP_CLIENT_ID` | Authorizer, Graph, Search | Cognito MCP app client ID |

Note: `SNS_CAPTURE_TOPIC_ARN` is not needed as a Lambda env var — SNS publishing for capture-complete events is handled separately from the capture Lambda.

## Commit conventions

- Format: `type: description`
- Types: `feat:`, `fix:`, `infra:`, `docs:`, `refactor:`, `test:`, `chore:`
- `infra:` for Terraform changes (instead of `chore:`)
- Body: explain why, not what
- Reference issue numbers: `feat: capture lambda handler (#3)`

## What NOT to do

- Never hardcode AWS account IDs, regions, or resource names — use environment variables
- Never use `*` in IAM policies — enumerate specific actions and resources
- Never commit `.tfvars` files with secrets — use SSM or environment variables
- Never skip error handling in Lambda handlers
- Never use `console.log` for structured data — use JSON-formatted logging
- Never bypass the three-layer architecture (Interface → Compute → Memory)
