# ADR-003: Authentication and Content Visibility Model

**Status**: Proposed  
**Date**: 2026-03-21  
**Issue**: [#17](https://github.com/jonmatum/serverless-second-brain/issues/17)

## Context

The system currently has minimal auth:
- `POST /capture` requires an API key (shared secret)
- All `GET` endpoints are fully public (no auth)
- AgentCore Gateway/Runtime uses IAM auth (AWS credentials only)
- MCP write tools have no external auth

This is a personal knowledge graph. The owner should be able to choose whether their content is public (portfolio/blog), private (personal notes), or mixed. External agents and frontends need proper authentication.

## Decision

### Content visibility model

Every node has a `visibility` field:

| Value | Meaning |
|---|---|
| `public` | Visible to anyone, no auth required |
| `private` | Visible only to authenticated users (owner) |

Default visibility is configurable per deployment via `var.default_visibility` (default: `private`). The owner can override per node.

### Access matrix

| Operation | Anonymous | Authenticated (owner) |
|---|---|---|
| Read public nodes | ✅ | ✅ |
| Read private nodes | ❌ | ✅ |
| Search (returns public only) | ✅ | ✅ (returns all) |
| Graph (returns public only) | ✅ | ✅ (returns all) |
| Create nodes | ❌ | ✅ |
| Create edges | ❌ | ✅ |
| Flag nodes | ❌ | ✅ |
| MCP read tools (public) | ✅ | ✅ |
| MCP write tools | ❌ | ✅ |

### Authentication provider: Cognito

| Component | Auth mechanism |
|---|---|
| Frontend (SPA) | Cognito User Pool — hosted UI or custom login |
| REST API writes | Cognito JWT token via `Authorization: Bearer` header |
| REST API reads | Optional JWT — anonymous gets public only, authenticated gets all |
| MCP write tools | Cognito client credentials (machine-to-machine) |
| MCP read tools | Optional — anonymous gets public only |
| CI/CD | OIDC (unchanged) |

### Cognito setup

- **User Pool**: one per environment (`ssb-dev-users`, `ssb-prod-users`)
- **App client (SPA)**: authorization code flow with PKCE, no client secret
- **App client (MCP)**: client credentials flow, with client secret
- **Resource server**: `ssb-api` with scopes: `read`, `write`
- **Domain**: Cognito hosted domain (`ssb-dev.auth.us-east-1.amazoncognito.com`)

### API Gateway integration

| Endpoint | Authorizer | Behavior |
|---|---|---|
| `GET /health` | None | Always public |
| `GET /graph` | Cognito (optional) | No token → public nodes only. Valid token → all nodes |
| `GET /search` | Cognito (optional) | Same as graph |
| `GET /nodes/{id}` | Cognito (optional) | No token → 404 if private. Valid token → always returns |
| `POST /capture` | Cognito (required) | 401 without valid token. Replaces API key |

"Optional" means the authorizer validates the token if present but doesn't reject anonymous requests. API Gateway supports this via a Lambda authorizer that returns different IAM policies based on token presence.

### DynamoDB schema change

Add `visibility` field to META items:

```json
{
  "PK": "NODE#serverless",
  "SK": "META",
  "visibility": "public",
  ...
}
```

- New field: `visibility` — `"public"` or `"private"`
- Default: from `var.default_visibility` environment variable
- Existing nodes: migration sets all current nodes to `public` (they were already publicly accessible)
- GSI consideration: no new GSI needed — visibility filtering happens in Lambda after query/scan

### Lambda changes

Read Lambdas (graph, search) receive the auth context from API Gateway:
- If `event.requestContext.authorizer` contains a valid user → return all nodes
- If no authorizer context → filter to `visibility: "public"` only

Write Lambdas (capture, connect, flag) reject requests without valid auth context.

### MCP server changes

The MCP server already passes `actor: "agent:runtime"`. With Cognito:
- Read tools: work without auth (public content) or with auth (all content)
- Write tools: require a valid Cognito client credentials token
- The AgentCore Gateway validates the token before forwarding to the Runtime

### Migration strategy

1. Deploy Cognito (User Pool + app clients) — no breaking changes
2. Add `visibility` field to new nodes (default from env var)
3. Migrate existing nodes — set `visibility: "public"` (preserves current behavior)
4. Add Lambda authorizer to API Gateway — anonymous still works for reads
5. Switch `POST /capture` from API key to Cognito JWT
6. Deprecate API key after frontend is deployed with Cognito login

Steps 1-3 can ship together. Steps 4-6 are a separate PR to avoid breaking existing clients.

### Frontend auth flow

```
User → CloudFront → SPA (static)
  → Login button → Cognito hosted UI → redirect with auth code
  → SPA exchanges code for tokens (PKCE)
  → SPA calls API with Authorization: Bearer {access_token}
  → API Gateway validates JWT → Lambda sees authenticated user
```

Anonymous users see public content only. Logged-in owner sees everything.

## Terraform variables

```hcl
variable "default_visibility" {
  description = "Default visibility for new nodes: public or private"
  type        = string
  default     = "private"
  validation {
    condition     = contains(["public", "private"], var.default_visibility)
    error_message = "Visibility must be public or private."
  }
}

variable "cognito_callback_urls" {
  description = "Allowed callback URLs for Cognito (frontend URLs)"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "cognito_logout_urls" {
  description = "Allowed logout URLs for Cognito"
  type        = list(string)
  default     = ["http://localhost:3000"]
}
```

## Cost impact

| Service | Idle cost | Notes |
|---|---|---|
| Cognito User Pool | $0.00 | Free tier: 50,000 MAU |
| Lambda authorizer | $0.00 | Invoked per request, cached 5 min |
| Total added | $0.00 | No impact on idle cost |

No ADR required for cost — stays within the $1/mo idle constraint.

## What this does NOT cover

- **Multi-user**: This is a single-owner system. Cognito has one user (the owner). Multi-user with shared graphs is a different architecture.
- **Fine-grained permissions**: No per-node ACLs. Visibility is binary (public/private), not role-based.
- **API rate limiting per user**: Stays at API Gateway level, not per-Cognito-user.
- **WAF**: Deferred. Can be added to API Gateway and CloudFront later.

## Implementation plan

| Phase | Scope | Breaking changes |
|---|---|---|
| Phase A | Cognito module + `visibility` field + migration | None — reads stay public |
| Phase B | Lambda authorizer + optional auth on reads | None — anonymous still works |
| Phase C | Require auth on writes (replace API key) | Yes — clients must use JWT |
| Phase D | Frontend login integration | None — new feature |

## References

- [Cognito User Pool + API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)
- [API Gateway Lambda authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html)
- `.kiro/steering/api-spec.md` — current auth model
- `.kiro/steering/architecture.md` — two doors principle
