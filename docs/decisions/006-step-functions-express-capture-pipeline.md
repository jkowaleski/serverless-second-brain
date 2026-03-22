# ADR-006: Step Functions Express Workflow for Capture Pipeline

**Status**: Superseded
**Date**: 2026-03-21
**Superseded**: 2026-03-22 — Capture reverted to monolithic Lambda handler. SFN infrastructure and step handlers fully removed. See [context](#superseded-context).

## Decision

Orchestrate the capture pipeline (validate → classify → persist → create edges) using Step Functions Express Workflow with synchronous execution, triggered by API Gateway.

ASL state names: `ValidateInput → GenerateMetadata → PersistNode → CreateEdges → NotifySuccess` (see `event-schemas.md`).

## Context

The capture pipeline has 4 sequential steps with different failure modes: input validation (fast, deterministic), Bedrock classification (slow, throttle-prone), DynamoDB persistence (fast, conditional write failures), and edge creation (fast, depends on persistence). The original design was a monolithic Lambda doing all steps sequentially.

## Options considered

### Option 1: Monolithic Lambda

- Single Lambda handler runs all 4 steps sequentially
- Simple to deploy and debug
- No retry granularity — if Bedrock throttles on step 2, the entire pipeline retries from step 1
- Timeout risk: Bedrock classification can take 5-50 seconds, leaving little room for the other steps within a 30-second Lambda timeout

### Option 2: Step Functions Express Workflow (chosen)

- Each step is a separate Lambda invocation with its own timeout and retry policy
- Express Workflow runs synchronously — API Gateway waits for the result
- Bedrock throttling retries only the classify step, not the entire pipeline
- Cost: $0.000025 per state transition (4 steps × $0.000025 = $0.0001 per capture)
- Maximum duration: 5 minutes (vs 30 seconds for a single Lambda)

### Option 3: Step Functions Standard Workflow

- Asynchronous execution — API Gateway returns immediately with an execution ARN
- Client must poll for results
- Better for long-running workflows (up to 1 year)
- Overkill for a 10-second pipeline
- Worse UX: the SPA would need polling logic instead of a simple POST → response

### Option 4: SQS-based pipeline

- POST /capture enqueues a message, returns 202 Accepted
- Each step reads from one queue, writes to the next
- Fully async, naturally decoupled
- No synchronous response — client doesn't know if capture succeeded until polling
- More infrastructure (4 queues, 4 Lambda triggers, DLQs)

### Option 5: Lambda chaining (invoke next Lambda directly)

- Each Lambda invokes the next via `InvokeCommand`
- No orchestrator overhead
- Retry logic must be hand-coded in each Lambda
- Debugging requires correlating logs across 4 functions manually
- Tight coupling between functions

## Decision rationale

1. **Granular retry**: Bedrock throttling (89.6% throttle rate observed in benchmark #3) is the primary failure mode. Step Functions retries only the classify step with exponential backoff (2s, 4s, 8s) without re-running validation or persistence.
2. **Synchronous response**: Express Workflow returns the final result to API Gateway, which returns it to the client. No polling, no WebSockets, no complexity.
3. **Observability**: Step Functions console shows the execution graph with timing per step, input/output per state, and error details. This is significantly better than correlating CloudWatch logs across 4 Lambdas.
4. **Cost**: at 100 captures/day, Step Functions costs ~$0.30/month. Negligible compared to Bedrock.

## Consequences

- API Gateway uses a `StartSyncExecution` integration (not Lambda proxy). The VTL response template must extract the output from the Step Functions response envelope.
- The VTL template must check execution status — a failed execution returns 200 from Step Functions but should return 500 to the client. This was a bug caught in commit `be31ad0`.
- Each step Lambda shares the same code package but has a different handler entry point (`index.validate`, `index.classify`, `index.persist`, `index.createEdges`).
- Step Functions retry configuration interacts with application-level retry. The `invokeWithRetry()` in `bedrock.ts` retries 3× with backoff, and Step Functions retries the Lambda 3× on top of that. This created a retry cascade that amplified Bedrock invocations 2.2× (benchmark #3). Fixed in commit `031b012` by only retrying `BedrockError` in the ASL, not `States.TaskFailed`.

## Lessons learned

1. **Retry interaction is the hardest part.** Application-level retry (SDK) × orchestrator retry (Step Functions) = multiplicative invocations. The fix was to make Step Functions retry only on specific error names, not on generic task failures.
2. **VTL is fragile.** The response mapping template silently passed failed executions as 201 success until caught in testing. Always check `status` in the VTL template.
3. **Express Workflow 5-minute limit** is generous for this use case but would be a constraint for batch operations. The surfacing pipeline (Phase 4) uses a direct Lambda invocation from EventBridge, not Step Functions.

## References

- [Step Functions Express vs Standard](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html) — AWS, 2024
- [Benchmark results](../benchmarks/results.md) — Benchmark 3 (throttle cascade)
- `.kiro/steering/event-schemas.md` — ASL state definitions

## Superseded context

**Date**: 2026-03-22

The capture pipeline was reverted to a monolithic Lambda handler (Option 1) and the Step Functions infrastructure was fully removed:

- 4 SFN step Lambda functions destroyed
- State machine destroyed
- SFN CloudWatch alarm removed
- SFN dashboard widget removed
- Step handler source files (`src/functions/capture/steps/`) deleted

**Why**: The monolithic handler proved simpler to operate. Bedrock throttling was resolved by switching to a cross-region inference profile (`us.anthropic.claude-sonnet-4-20250514-v1:0`), eliminating the primary justification for granular retry. The 30-second Lambda timeout is sufficient now that Bedrock responds in 3–8 seconds consistently. The VTL response mapping complexity and retry cascade bugs (commits `be31ad0`, `031b012`) added operational burden without proportional benefit.

**What remains**: The ADR is preserved as a record of the decision and lessons learned. If batch/async capture is needed in the future, consider SQS + Lambda (Option 4) rather than re-introducing Step Functions.
