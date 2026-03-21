import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getNode, getAllNodes, getAllEdges, getNodeEdges, getInboundEdges, batchGetNodes } from "../../shared/dynamodb.js";
import { NotFoundError } from "../../shared/errors.js";
import { isAuthenticated } from "../../shared/auth.js";
import type { MetaItem, EdgeItem } from "../../shared/types.js";

// In-memory cache for warm invocations
let cachedGraph: { nodes: MetaItem[]; edges: EdgeItem[] } | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CORS_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? "*";

async function loadGraph() {
  if (!cachedGraph || Date.now() - cacheTime > CACHE_TTL_MS) {
    const [nodes, edges] = await Promise.all([getAllNodes(), getAllEdges()]);
    cachedGraph = { nodes, edges };
    cacheTime = Date.now();
  }
  return cachedGraph;
}

function formatEdge(e: EdgeItem) {
  return {
    source: e.PK.replace("NODE#", ""),
    target: e.SK.replace("EDGE#", ""),
    edge_type: e.edge_type,
    weight: e.weight,
  };
}

function formatNode(n: MetaItem) {
  return {
    id: n.slug,
    title: n.title,
    node_type: n.node_type,
    status: n.status,
    tags: n.tags,
  };
}

async function handleGraph(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const typeFilter = event.queryStringParameters?.type;
  const statusFilter = event.queryStringParameters?.status;
  const authed = await isAuthenticated(event);
  const graph = await loadGraph();

  let nodes = graph.nodes;
  if (!authed) nodes = nodes.filter((n) => n.visibility !== "private");
  if (typeFilter) nodes = nodes.filter((n) => n.node_type === typeFilter);
  if (statusFilter) nodes = nodes.filter((n) => n.status === statusFilter);

  const slugSet = new Set(nodes.map((n) => n.slug));
  const edges = graph.edges.filter((e) => {
    const src = e.PK.replace("NODE#", "");
    const tgt = e.SK.replace("EDGE#", "");
    return slugSet.has(src) && slugSet.has(tgt);
  });

  // Count edges per node
  const edgeCounts = new Map<string, number>();
  for (const e of edges) {
    const src = e.PK.replace("NODE#", "");
    edgeCounts.set(src, (edgeCounts.get(src) ?? 0) + 1);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    body: JSON.stringify({
      nodes: nodes.map((n) => ({ ...formatNode(n), edge_count: edgeCounts.get(n.slug) ?? 0 })),
      edges: edges.map(formatEdge),
      meta: {
        node_count: nodes.length,
        edge_count: edges.length,
        generated_at: new Date().toISOString(),
      },
    }),
  };
}

async function handleNode(slug: string, authed: boolean): Promise<APIGatewayProxyResult> {
  const node = await getNode(slug);
  if (!node) throw new NotFoundError(`Node '${slug}' not found`);
  if (!authed && node.visibility === "private") throw new NotFoundError(`Node '${slug}' not found`);

  const [outbound, inbound] = await Promise.all([getNodeEdges(slug), getInboundEdges(slug)]);

  // Fetch related node summaries via batch
  const relatedSlugs = [
    ...outbound.map((e) => e.SK.replace("EDGE#", "")),
    ...inbound.map((e) => e.PK.replace("NODE#", "")),
  ];
  const relatedMeta = await batchGetNodes(relatedSlugs);
  const relatedNodes = relatedMeta.map((rn) => ({ id: rn.slug, title: rn.title, node_type: rn.node_type, status: rn.status }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    body: JSON.stringify({
      node: {
        id: node.slug,
        title: node.title,
        title_es: node.title_es,
        title_en: node.title_en,
        summary_es: node.summary_es,
        summary_en: node.summary_en,
        node_type: node.node_type,
        status: node.status,
        tags: node.tags,
        created_at: node.created_at,
        updated_at: node.updated_at,
        word_count_es: node.word_count_es,
        word_count_en: node.word_count_en,
      },
      edges: outbound.map((e) => ({
        target: e.SK.replace("EDGE#", ""),
        edge_type: e.edge_type,
        weight: e.weight,
      })),
      related: relatedNodes,
    }),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const nodeId = event.pathParameters?.id;
    if (nodeId) return await handleNode(nodeId, await isAuthenticated(event));
    return await handleGraph(event);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { statusCode: 404, body: JSON.stringify({ error: "not_found", message: error.message }) };
    }
    console.error("Graph error:", JSON.stringify(error));
    return { statusCode: 500, body: JSON.stringify({ error: "internal_error", message: "Internal server error" }) };
  }
};
