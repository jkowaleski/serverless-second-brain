import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getAllNodes, getAllEmbeddings } from "../../shared/dynamodb.js";
import { embed } from "../../shared/bedrock.js";
import { ValidationError } from "../../shared/errors.js";
import { isAuthenticated } from "../../shared/auth.js";
import type { MetaItem, EmbedItem } from "../../shared/types.js";

const KEYWORD_WEIGHT = 0.3;
const SEMANTIC_WEIGHT = 0.7;
const CORS_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? "*";

// In-memory cache for warm Lambda invocations
let cachedNodes: MetaItem[] | null = null;
let cachedEmbeddings: EmbedItem[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function keywordScore(node: MetaItem, terms: string[]): number {
  const text = `${node.title} ${node.title_es} ${node.title_en} ${node.summary_es} ${node.summary_en} ${node.tags.join(" ")}`.toLowerCase();
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

    // Load or use cache
    if (!cachedNodes || !cachedEmbeddings || Date.now() - cacheTime > CACHE_TTL_MS) {
      [cachedNodes, cachedEmbeddings] = await Promise.all([getAllNodes(), getAllEmbeddings()]);
      cacheTime = Date.now();
    }

    // Build embedding lookup
    const embedMap = new Map<string, number[]>();
    for (const e of cachedEmbeddings) {
      const slug = e.PK.replace("NODE#", "");
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
          title_es: node.title_es,
          title_en: node.title_en,
          summary_es: node.summary_es,
          summary_en: node.summary_en,
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

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
      body: JSON.stringify({
        query: q,
        results: scored,
        total: scored.length,
        took_ms: Date.now() - start,
      }),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { statusCode: 400, body: JSON.stringify({ error: "validation_error", message: error.message }) };
    }
    console.error("Search error:", JSON.stringify(error));
    return { statusCode: 500, body: JSON.stringify({ error: "internal_error", message: "Internal server error" }) };
  }
};
