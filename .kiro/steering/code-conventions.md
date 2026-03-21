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
    dynamodb.ts       → DynamoDB client + helpers (getNode, putNode, queryEdges)
    s3.ts             → S3 client + helpers (getBody, putBody)
    bedrock.ts        → Bedrock client + helpers (classify, embed)
    validation.ts     → Input validation (slug format, required fields)
    errors.ts         → Error types (ValidationError, NotFoundError, DuplicateError)
  functions/
    capture/
      handler.ts      → Monolithic Lambda entry point (direct invocation / testing)
      index.ts        → Export all handlers (monolithic + step handlers)
      steps/
        validate.ts   → Step 1: parse input + fetch existing slugs
        classify.ts   → Step 2: Bedrock classification + slug generation + duplicate check
        persist.ts    → Step 3: write META to DynamoDB + body to S3 + audit
        create-edges.ts → Step 4: write EDGE items + return CaptureResponse
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
| `SNS_DIGEST_TOPIC_ARN` | Surfacing | SNS topic for daily digest |
| `ENVIRONMENT` | All | `dev` or `prod` |

Note: `SNS_CAPTURE_TOPIC_ARN` is not needed as a Lambda env var — SNS publishing for capture-complete is handled natively by Step Functions (NotifySuccess state).

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
