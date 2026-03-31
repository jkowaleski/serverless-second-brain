import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getAllNodes, getAllEmbeddings, getCacheVersion } from "../../shared/dynamodb.js";
import { embed } from "../../shared/bedrock.js";
import { ValidationError } from "../../shared/errors.js";
import { isAuthenticated } from "../../shared/auth.js";
import { cosine } from "../../shared/math.js";
import { jsonResponse, errorResponse } from "../../shared/http.js";
import { fromNodeKey } from "../../shared/keys.js";
import type { MetaItem, EmbedItem } from "../../shared/types.js";

const KEYWORD_WEIGHT = 0.3;
const SEMANTIC_WEIGHT = 0.7;

// In-memory cache for warm Lambda invocations — version-based (same as graph)
let cachedNodes: MetaItem[] | null = null;
let cachedEmbeddings: EmbedItem[] | null = null;
let cacheVersion = "";

function keywordScore(node: MetaItem, terms: string[]): number {
  const text = `${node.title} ${node.summary} ${node.tags.join(" ")}`.toLowerCase();
  let matched = 0;
  for (const term of terms) {
    if (text.includes(term)) matched++;
  }
  return terms.length === 0 ? 0 : matched / terms.length;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const q = event.queryStringParameters?.q;
    if (!q) throw new ValidationError("q parameter is required");

    const limit = Math.min(parseInt(event.queryStringParameters?.limit ?? "10"), 50);
    const typeFilter = event.queryStringParameters?.type;
    const statusFilter = event.queryStringParameters?.status;

    const start = Date.now();
    const authed = await isAuthenticated(event);

    // Load or use cache — version-based invalidation
    const currentVersion = await getCacheVersion();
    if (!cachedNodes || !cachedEmbeddings || currentVersion !== cacheVersion) {
      [cachedNodes, cachedEmbeddings] = await Promise.all([getAllNodes(), getAllEmbeddings()]);
      cacheVersion = currentVersion;
    }

    // Build embedding lookup
    const embedMap = new Map<string, number[]>();
    for (const e of cachedEmbeddings) {
      const slug = fromNodeKey(e.PK);
      embedMap.set(slug, e.vector);
    }

    // Generate query embedding
    const queryVector = await embed(q);
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

    // Score all nodes
    const scored = cachedNodes
      .filter((n) => (!typeFilter || n.node_type === typeFilter) && (!statusFilter || n.status === statusFilter))
      .filter((n) => authed || n.visibility !== "private")
      .map((node) => {
        const kw = keywordScore(node, terms);
        const vec = embedMap.get(node.slug);
        const sem = vec ? cosine(queryVector, vec) : 0;
        const score = KEYWORD_WEIGHT * kw + SEMANTIC_WEIGHT * sem;
        return {
          id: node.slug,
          title: node.title,
          summary: node.summary,
          node_type: node.node_type,
          status: node.status,
          tags: node.tags,
          score: Math.round(score * 100) / 100,
          score_keyword: Math.round(kw * 100) / 100,
          score_semantic: Math.round(sem * 100) / 100,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return jsonResponse(200, {
      query: q,
      results: scored,
      total: scored.length,
      took_ms: Date.now() - start,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, "validation_error", error.message);
    }
    console.error("Search error:", JSON.stringify(error));
    return errorResponse(500, "internal_error", "Internal server error");
  }
};
