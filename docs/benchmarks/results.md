# Benchmark Results — Serverless Second Brain

**Date**: 2026-03-22 (updated)
**Previous benchmark**: 2026-03-21 (178 nodes, pre-async split)
**Graph size**: 0 nodes (purged for testing), infrastructure at full scale
**Region**: us-east-1
**Issue**: [#12](https://github.com/jonmatum/serverless-second-brain/issues/12)

## Architecture changes since last benchmark

| Change | Impact |
|---|---|
| Step Functions removed entirely | No SFN cost, no retry cascade |
| Async enrichment (ADR-014) | Capture returns in <5s, body generated async |
| Cross-region inference profile | Bedrock throttling resolved |
| 20 recent slugs (not all) | ~78% input token reduction |
| `keys.ts` wired everywhere | No functional impact, code quality |

## 30-Day Real Usage (2026-02-21 to 2026-03-22)

### Lambda invocations

| Function | Invocations | Avg duration | Max duration | Errors | Memory |
|---|---|---|---|---|---|
| capture | 91 | 10,892ms | 30,000ms | 12 | 512 MB |
| enrich | 17 | 19,533ms | 26,438ms | 2 | 512 MB |
| graph | 1 | 394ms | 1,446ms | 0 | 256 MB |
| search | 126 | 964ms | 9,391ms | 0 | 512 MB |
| connect | 25 | 532ms | 693ms | 0 | 256 MB |
| flag | 25 | 450ms | 597ms | 0 | 256 MB |
| surfacing | 18 | 2,566ms | 2,778ms | 0 | 512 MB |
| authorizer | 85 | 272ms | 878ms | 1 | 256 MB |

Notes:
- Capture avg includes pre-async-split runs (monolithic handler doing classify + body + embed). Post-split, classify-only should be ~3-5s.
- Enrich avg 19.5s is expected — body generation (4096 tokens) + S3 write + embedding + edge creation.
- Capture errors (12) include development testing, validation errors, and Bedrock throttles before cross-region fix.

### Bedrock LLM utilization

#### Claude Sonnet 4

| Metric | 30-day value |
|---|---|
| Invocations | 943 |
| Input tokens | 5,703,160 (6,048 avg/call) |
| Output tokens | 466,906 (495 avg/call) |
| Avg latency | 6,936ms |
| Max latency | 49,322ms |
| Input cost | $17.11 |
| Output cost | $7.00 |
| **Total** | **$24.11** |

Invocation breakdown (estimated):

| Operation | Calls | Avg input | Avg output | Cost/call | Subtotal |
|---|---|---|---|---|---|
| Classify (capture) | 91 | ~2,000 | ~500 | $0.014 | $1.23 |
| Body gen (enrich) | 17 | ~1,000 | ~3,000 | $0.048 | $0.82 |
| Node chat + testing | 835 | ~6,500 | ~400 | $0.026 | $21.29 |

Node chat dominates cost because it includes the full node body as context (~4-8K tokens input per call). The 835 calls include heavy development/testing — normal usage would be much lower.

#### Titan Embed V2

| Metric | 30-day value |
|---|---|
| Invocations | 281 |
| Input tokens | 14,532 (52 avg/call) |
| Avg latency | 134ms |
| Max latency | 7,128ms |
| **Total cost** | **$0.0003** |

Embedding cost is negligible — $0.000001 per call.

### DynamoDB

| Metric | 30-day value |
|---|---|
| Read capacity units consumed | 32,850 |
| Write capacity units consumed | 7,212 |
| Table items (at peak) | ~1,200 |
| Table size (at peak) | 108 KB |
| Estimated cost (post free-tier) | $0.011 |

### API Gateway

| Metric | 30-day value |
|---|---|
| Total requests | 3,390 |
| 4XX errors | 268 (7.9%) |
| 5XX errors | 88 (2.6%) |
| Avg latency | 1,551ms |

4XX errors are mostly auth failures during development. 5XX errors correlate with Bedrock throttles (pre cross-region fix).

### CloudFront

| Metric | 30-day value |
|---|---|
| Requests | 3,754 |
| Data transferred | 28.6 MB |

### S3 storage

| Bucket | Objects | Size |
|---|---|---|
| ssb-dev-content | 28 | < 1 MB |
| ssb-dev-frontend | 395 | 12.4 MB |

### Cognito

| Metric | Value |
|---|---|
| Users | 4 |
| Cost | $0.00 (free tier: 50K MAU) |

## Actual cost (30 days)

| Service | Cost | Notes |
|---|---|---|
| Bedrock Claude Sonnet 4 | $24.11 | 943 invocations (heavy dev/testing) |
| Bedrock Titan Embed V2 | $0.00 | 281 invocations |
| Lambda | $0.00 | Free tier (320/400K GB-s used) |
| API Gateway | $0.00 | Free tier (3.4K/1M calls) |
| DynamoDB | $0.00 | Free tier (25 RCU/WCU) |
| S3 | $0.00 | Free tier (5 GB) |
| CloudFront | $0.00 | Free tier (1 TB) |
| CloudWatch | $0.00 | Free tier (10 metrics) |
| Cognito | $0.00 | Free tier (50K MAU) |
| **Total** | **$24.11** | **99.99% is Bedrock** |

## Per-operation cost

| Operation | Claude in | Claude out | Titan | Total |
|---|---|---|---|---|
| Capture (classify meta) | ~2,000 | ~500 | — | $0.014 |
| Enrich (body + embed) | ~1,000 | ~3,000 | ~50 | $0.048 |
| Full capture pipeline | ~3,000 | ~3,500 | ~50 | $0.062 |
| Node chat edit | ~6,500 | ~400 | — | $0.026 |
| Search (semantic) | — | — | ~20 | $0.000 |
| Graph read | — | — | — | $0.000 |

## Projected monthly cost by usage level

| Load | Captures/day | Searches/day | Bedrock | Infra | Total |
|---|---|---|---|---|---|
| Idle (0 req/day) | 0 | 0 | $0.00 | $0.00* | $0.00* |
| Light (5 req/day) | 5 | 10 | $9.30 | $0.00* | $9.30 |
| Moderate (20 req/day) | 20 | 50 | $37.20 | $0.03 | $37.23 |
| Heavy (100 req/day) | 100 | 200 | $186.00 | $0.15 | $186.15 |

*Free tier covers all infrastructure at low usage. Bedrock has no free tier.

### Essay estimate vs. actual (revised)

| Load level | Original essay | Previous benchmark | Current (post-improvements) |
|---|---|---|---|
| Idle | $0.51/mo | $0.00 | $0.00 |
| Moderate (100 req/day) | $2.44/mo | $93.82/mo (dev burst) | ~$186/mo |
| High (1,000 req/day) | $11.21/mo | — | ~$1,860/mo |

The original essay underestimated Bedrock costs by ~17x. The essay assumed $0.003/classify — actual is $0.062/capture (classify + body generation). The async split (ADR-014) didn't reduce cost, it improved UX by making capture feel instant.

## Optimization opportunities

### 1. Switch to Claude Haiku for classify ($0.014 → ~$0.001)

Classify only generates metadata (title, summary, tags, slug). This doesn't need Sonnet-level reasoning. Haiku 3.5 at $0.25/1M input, $1.25/1M output would reduce classify cost by ~93%.

| Model | Cost/classify | Cost/month (20/day) |
|---|---|---|
| Sonnet 4 (current) | $0.014 | $8.40 |
| Haiku 3.5 | $0.001 | $0.60 |

### 2. Reduce node chat context

Node chat sends the full body as context (~4-8K tokens). Options:
- Send only summary + tags for simple operations (status, visibility, delete)
- Truncate body to first 2K tokens for content edits
- Estimated savings: 50-70% on node chat input tokens

### 3. Cache Titan embeddings for repeated searches

Same query within a TTL window doesn't need re-embedding. Simple in-memory cache in Lambda would eliminate redundant Titan calls (already negligible cost, but reduces latency).

## Improvements applied (cumulative)

| Date | Change | Impact |
|---|---|---|
| 2026-03-21 | SFN retry fix (`031b012`) | Eliminated retry cascade |
| 2026-03-21 | 20 recent slugs (`2b68b49`, #19) | ~78% input token reduction for classify |
| 2026-03-22 | Remove SFN entirely | No SFN cost, simpler deployment |
| 2026-03-22 | Async enrichment (ADR-014) | Capture <5s UX, body generated async |
| 2026-03-22 | Cross-region inference | Bedrock throttling resolved |

## Benchmark 1: DynamoDB Single-Table Graph Performance

*(Unchanged from 2026-03-21 — 178 nodes)*

| Endpoint | avg | p50 | p95 | min | max |
|---|---|---|---|---|---|
| GET /nodes/{id} | 344ms | 343ms | 351ms | 329ms | 351ms |
| GET /graph | 488ms | 489ms | 491ms | 483ms | 491ms |
| GET /search?q=serverless | 450ms | 429ms | 502ms | 408ms | 557ms |
| GET /nodes/404 | 313ms | 308ms | 316ms | 300ms | 341ms |

### Projected scaling limits

| Nodes | Est. items | Est. scan time | Practical? |
|---|---|---|---|
| 178 | 1,212 | ~290ms | ✅ |
| 1,000 | ~7,000 | ~1.5s | ✅ |
| 5,000 | ~35,000 | ~7s | ⚠️ |
| 10,000 | ~70,000 | ~15s | ❌ Lambda timeout |

**Crossover point**: ~5,000 nodes → paginated API or S3 snapshot.

## Benchmark 2: Semantic Search Comparison

*(Decision unchanged — stay with DynamoDB until ~5,000 nodes)*

| Scale | Best choice | Idle cost |
|---|---|---|
| < 5,000 nodes | DynamoDB scan (current) | $0.00 |
| 5,000–50,000 | Aurora pgvector | ~$43/mo |
| > 50,000 | OpenSearch Serverless | ~$350/mo |

## Free tier utilization (March 2026)

| Service | Used | Free tier limit | % used |
|---|---|---|---|
| Lambda GB-seconds | 320 | 400,000 | 0.08% |
| Lambda requests | 1,930 | 1,000,000 | 0.19% |
| X-Ray traces | 1,357 | 100,000 | 1.36% |
| CloudWatch alarms | 0.68 | 10 | 6.8% |
| KMS requests | 989 | 20,000 | 4.9% |

Infrastructure is at <1% of free tier limits. Bedrock is the only cost driver.

## Reproducibility

```bash
# Query Bedrock token usage (30 days)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Bedrock --metric-name InputTokenCount \
  --dimensions Name=ModelId,Value=us.anthropic.claude-sonnet-4-20250514-v1:0 \
  --start-time $(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 2592000 --statistics Sum \
  --region us-east-1

# Query Lambda invocations
for fn in capture enrich graph search connect flag surfacing authorizer; do
  aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda --metric-name Invocations \
    --dimensions Name=FunctionName,Value=ssb-dev-$fn \
    --start-time $(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 2592000 --statistics Sum \
    --region us-east-1
done

# AWS Cost Explorer
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -v-30d +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```
