# ADR-009: Spec-Driven Development (SDD) Approach

**Status**: Accepted
**Date**: 2026-03-21
**Context**: Commit `8c142a7` (steering files), `.kiro/steering/` directory

## Decision

Define all contracts (API spec, DynamoDB schema, MCP tools, event schemas, Terraform conventions, code conventions, architecture) as steering files before writing any implementation code.

## Context

The project started from an essay that described the architecture in prose. Before writing any Terraform or TypeScript, the question was: how do we translate an essay into working code without the implementation drifting from the design?

## Options considered

### Option 1: Code-first with generated docs

- Write Terraform and Lambda code, generate docs from code comments and OpenAPI
- Fast to start, docs always match implementation
- Risk: implementation decisions are made ad-hoc, no upfront design review
- The essay's architecture could drift without anyone noticing

### Option 2: TDD (test-driven development)

- Write tests first, then implementation
- Good for business logic, awkward for infrastructure (Terraform has no native test framework for integration tests)
- Doesn't capture architectural decisions or API contracts

### Option 3: Spec-driven development (chosen)

- Write 7 steering files defining every contract before any code
- Implementation must conform to the specs
- Specs are the source of truth; code is the implementation

## The 7 steering files

| File | What it defines |
|---|---|
| `architecture.md` | Three-layer principle, services, cost constraints, phases |
| `dynamodb-schema.md` | Single-table design, item types, GSIs, validation rules |
| `api-spec.md` | REST endpoints, request/response schemas, error codes |
| `mcp-tools.md` | MCP tool definitions, JSON Schema inputs, write safety |
| `event-schemas.md` | EventBridge rules, SNS messages |
| `terraform-conventions.md` | Naming, modules, state, security, domain config |
| `code-conventions.md` | TypeScript rules, Lambda patterns, error handling |

All 7 were committed in `8c142a7` before any infrastructure or application code.

## Decision rationale

1. **Essay-to-code traceability**: every steering file traces back to a section of the essay. When the implementation diverges, the spec makes it visible.
2. **AI agent alignment**: the steering files serve as context for AI coding agents (Kiro, Copilot). Agents that read `.kiro/steering/` produce code that conforms to the project's conventions without repeated prompting.
3. **Review surface**: PRs can be reviewed against the spec. "Does this Lambda conform to `api-spec.md`?" is a concrete question. "Does this look right?" is not.
4. **Domain-agnostic goal**: issue #13 aims to make the system deployable for any domain. Steering files define the contracts that remain constant across domains; only `terraform.tfvars` changes.

## Consequences

- Upfront time investment: the 7 steering files took ~2 hours to write before any code existed
- Specs can become stale if not updated when the implementation changes. The deep QA audits (commits `c44193d`, `1b1e1da`) caught 16 inconsistencies between specs and implementation.
- Not all decisions fit neatly into a steering file. ADRs (this directory) capture decisions that cross-cut multiple specs.
- The approach works best for greenfield projects where the architecture is known upfront. For exploratory projects, code-first may be more appropriate.

## References

- Commit `8c142a7` — Initial steering files
- Commit `c44193d` — Deep QA audit #1 (11 findings from spec-code comparison)
- Commit `1b1e1da` — Deep QA audit #2 (5 findings)
