# Benchmark Results — Serverless Second Brain

**Date**: 2026-03-21
**Graph size**: 178 nodes, 105 edges, ~1,212 total DynamoDB items
**Region**: us-east-1
**Issue**: [#12](https://github.com/jonmatum/serverless-second-brain/issues/12)

## Benchmark 1: DynamoDB Single-Table Graph Performance

### Methodology

10 warm requests per endpoint from a local client (Monterrey, MX → us-east-1). Latency includes network round-trip (~200ms baseline) + API Gateway + Lambda + DynamoDB.

### Results at 178 nodes

| Endpoint | avg | p50 | p95 | min | max |
|---|---|---|---|---|---|
| GET /nodes/{id} (single read) | 344ms | 343ms | 351ms | 329ms | 351ms |
| GET /graph (full scan) | 488ms | 489ms | 491ms | 483ms | 491ms |
| GET /search?q=serverless | 450ms | 429ms | 502ms | 408ms | 557ms |
| GET /nodes/404 | 313ms | 308ms | 316ms | 300ms | 341ms |

### Analysis

- **Single node read**: ~150ms server-side (344ms - ~200ms network). DynamoDB `GetItem` is O(1) — this won't degrade with scale.
- **Full graph scan**: ~290ms server-side. Scans all 1,212 items. This is the bottleneck that will degrade at scale.
- **Search**: ~250ms server-side. Includes Bedrock Titan embedding (87ms avg) + DynamoDB scan + in-memory cosine similarity. The scan portion will degrade.
- **404**: ~110ms server-side. Single `GetItem` returning empty — fastest possible path.

### Projected scaling limits

The full graph scan (`GET /graph`) reads every item in the table. DynamoDB scan throughput is ~128KB/page with pagination.

| Nodes | Est. items | Est. scan time | Practical? |
|---|---|---|---|
| 178 (current) | 1,212 | ~290ms | ✅ |
| 1,000 | ~7,000 | ~1.5s | ✅ Acceptable |
| 10,000 | ~70,000 | ~15s | ⚠️ Lambda timeout risk |
| 100,000 | ~700,000 | ~150s | ❌ Impractical |

**Recommendation**: At ~5,000 nodes, replace the full graph scan with:
1. Paginated API (`GET /graph?cursor=X&limit=100`)
2. Pre-computed graph snapshot in S3 (updated on write via DynamoDB Streams)
3. GSI2 queries for filtered views (by status, type)

Search has the same scan problem but is less severe because it can use GSI2 to filter by status/type before the cosine similarity pass.

## Benchmark 2: Semantic Search Comparison

### Current design: DynamoDB scan + in-memory cosine similarity

- **How it works**: Embed query via Titan → scan all EMBED items → compute cosine similarity in Lambda → rank and return top-K
- **Latency**: 450ms at 178 nodes (87ms embedding + ~160ms scan + ~3ms similarity)
- **Cost at rest**: $0.00 (PAY_PER_REQUEST)
- **Cost per query**: ~$0.000014 (Titan embedding) + DynamoDB RCU

### Alternative: OpenSearch Serverless with k-NN

- **How it works**: Embed query → k-NN search in OpenSearch → return top-K
- **Expected latency**: ~100-200ms (k-NN is O(log n) vs O(n) scan)
- **Cost at rest**: ~$350/month minimum (2 OCUs × $0.24/hr × 730hrs)
- **Cost per query**: ~$0.000014 (embedding) + negligible OCU

### Alternative: Aurora Serverless v2 with pgvector

- **How it works**: Embed query → `ORDER BY embedding <=> query LIMIT K` in PostgreSQL
- **Expected latency**: ~50-150ms with IVFFlat index
- **Cost at rest**: ~$43/month minimum (0.5 ACU × $0.12/hr × 730hrs)
- **Cost per query**: ~$0.000014 (embedding) + negligible ACU

### Decision framework

| Scale | Best choice | Why |
|---|---|---|
| < 5,000 nodes | DynamoDB (current) | $0 at rest, acceptable latency, simplest architecture |
| 5,000–50,000 | Aurora pgvector | $43/mo minimum but O(log n) search, SQL familiarity |
| > 50,000 | OpenSearch Serverless | Purpose-built for vector search, best latency at scale |

**Current decision**: Stay with DynamoDB. At 178 nodes, search latency is 450ms — well within acceptable range. The $0 idle cost aligns with the project's cost constraint. Revisit when approaching 5,000 nodes.

## Benchmark 3: Bedrock Costs in Production

### 7-day usage (2026-03-14 to 2026-03-21)

#### Claude Sonnet 4 (classification)

| Metric | Value |
|---|---|
| Invocations | 823 |
| Input tokens | 5,567,136 (avg 6,764/invocation) |
| Output tokens | 345,826 (avg 420/invocation) |
| Avg latency | 5,962ms |
| Min latency | 971ms |
| Max latency | 49,322ms |
| Throttle events | 7,094 (89.6% throttle rate) |
| Input cost | $16.70 |
| Output cost | $5.19 |
| **Total 7-day** | **$21.89** |
| **Per invocation** | **$0.0266** |

#### Titan Embed v2 (search embeddings)

| Metric | Value |
|---|---|
| Invocations | 176 |
| Input tokens | 12,513 (avg 71/invocation) |
| Avg latency | 87ms |
| Min/Max latency | 48ms / 183ms |
| **Total 7-day** | **$0.0025** |
| **Per invocation** | **$0.0000142** |

#### Total Bedrock cost

| Period | Cost |
|---|---|
| 7 days (actual) | $21.89 |
| 30 days (projected) | $93.82 |

### Essay estimate vs. actual

| Load level | Essay estimate | Actual (7-day extrapolated) |
|---|---|---|
| Idle | $0.00 | $0.00 ✅ |
| Moderate (100 req/day) | $1.50/mo | — |
| High (1,000 req/day) | $7.00/mo | — |
| Development burst (823 classifies/week) | — | $93.82/mo ❌ |

### Why actual is higher than estimated

1. **High input token count**: 6,764 tokens/invocation. The classify prompt includes all existing slugs for duplicate avoidance (~178 slugs × ~30 chars). At 10,000 nodes this would be ~300K tokens/invocation.

2. **Retry amplification**: The Step Functions retry bug (fixed in `031b012`) caused 2.2x invocations (157 classify calls for 70 captures). Each retry re-invoked Bedrock.

3. **Throttle cascade**: 89.6% throttle rate. Each throttle triggered a Step Functions retry, which re-invoked Bedrock, which throttled again. Vicious cycle.

4. **Development burst**: 823 invocations in 7 days is not normal usage — it's development + testing + smoke tests + migration.

### Recommendations

1. ~~**Reduce input tokens**: Pass only the last 50 slugs (most recent) instead of all slugs. Or use a Bloom filter for duplicate detection instead of passing the full list.~~ **Done** — `2b68b49` (#19). Validate step no longer fetches all slugs. Classify fetches 20 recent slugs for cross-reference hints only. Estimated reduction: 6,764 → ~1,500 tokens/invocation (~78%).

2. **Cache embeddings**: Search queries that repeat within a TTL window don't need re-embedding. Add a simple in-memory or DynamoDB cache.

3. ~~**Monitor throttling**: The `031b012` fix (only retry `BedrockError`, not `States.TaskFailed`) should eliminate the retry cascade. Monitor throttle rate over the next week.~~ **Tracking** in #21.

4. **Request quota increase**: If sustained usage exceeds the default Bedrock quota, request an increase via AWS Service Quotas.

## Improvements applied

| Date | Commit | Issue | Change | Impact |
|---|---|---|---|---|
| 2026-03-21 | `031b012` | — | Step Functions: only retry `BedrockError`, not `States.TaskFailed` | Eliminates retry cascade on `DuplicateError`. Reduces classify invocations from 2.2x to 1x. Fixes capture 504 timeout. |
| 2026-03-21 | `2b68b49` | #19 | Classify prompt: 20 recent slugs instead of all slugs | ~78% input token reduction (6,764 → ~1,500 tokens/invocation). Projected savings: ~$12/week at development rate. |

### Projected cost after improvements

| Factor | Before | After | Savings |
|---|---|---|---|
| Input tokens/classify | 6,764 | ~1,500 | -78% |
| Classify invocations (per capture) | 2.2x (retries) | 1x | -55% |
| Cost per capture | $0.027 | ~$0.005 | -81% |
| Projected 30-day (dev burst) | $93.82 | ~$18 | -81% |

## Lambda Performance

| Function | Invocations (7d) | Avg duration | Memory |
|---|---|---|---|
| capture-validate | 70 | 165ms | 256 MB |
| capture-classify | 157 | 1,630ms | 512 MB |
| capture-persist | 19 | 510ms | 256 MB |
| capture-edges | 19 | 411ms | 256 MB |
| search | 40 | 766ms | 512 MB |
| graph | 117 | 204ms | 256 MB |
| connect | 15 | 538ms | 256 MB |
| flag | 15 | 447ms | 256 MB |
| surfacing | 7 | 2,444ms | 512 MB |

### DynamoDB consumed capacity (7 days)

| Metric | Value | Est. cost |
|---|---|---|
| Read capacity units | 7,155 | $0.0018 |
| Write capacity units | 2,990 | $0.0037 |
| **Total** | | **$0.0055** |

DynamoDB cost is negligible — $0.02/month projected.

## Reproducibility

```bash
# Run DynamoDB latency benchmark
./scripts/benchmark-dynamodb.sh

# Run full smoke test (generates metrics)
./scripts/smoke-test.sh

# Query Bedrock costs (last 7 days)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Bedrock --metric-name InputTokenCount \
  --dimensions Name=ModelId,Value=us.anthropic.claude-sonnet-4-20250514-v1:0 \
  --start-time $(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 604800 --statistics Sum Average \
  --region us-east-1
```
