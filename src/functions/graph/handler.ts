import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getNode, getAllNodes, getAllEdges, getNodeEdges, getInboundEdges, batchGetNodes, getCacheVersion } from "../../shared/dynamodb.js";
import { getBody } from "../../shared/s3.js";
import { NotFoundError } from "../../shared/errors.js";
import { isAuthenticated } from "../../shared/auth.js";
import { jsonResponse, errorResponse } from "../../shared/http.js";
import { fromNodeKey, fromEdgeKey } from "../../shared/keys.js";
import type { MetaItem, EdgeItem } from "../../shared/types.js";

// In-memory cache for warm invocations
let cachedGraph: { nodes: MetaItem[]; edges: EdgeItem[] } | null = null;
let cacheVersion = "";

async function loadGraph() {
  const currentVersion = await getCacheVersion();
  if (!cachedGraph || currentVersion !== cacheVersion) {
    const [nodes, edges] = await Promise.all([getAllNodes(), getAllEdges()]);
    cachedGraph = { nodes, edges };
    cacheVersion = currentVersion;
  }
  return cachedGraph;
}

function formatEdge(e: EdgeItem) {
  return {
    source: fromNodeKey(e.PK),
    target: fromEdgeKey(e.SK),
    edge_type: e.edge_type,
    weight: e.weight,
  };
}

function formatNode(n: MetaItem) {
  return {
    id: n.slug,
    title: n.title,
    summary: n.summary,
    node_type: n.node_type,
    status: n.status,
    tags: n.tags,
    updated_at: n.updated_at,
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
    const src = fromNodeKey(e.PK);
    const tgt = fromEdgeKey(e.SK);
    return slugSet.has(src) && slugSet.has(tgt);
  });

  // Count edges per node
  const edgeCounts = new Map<string, number>();
  for (const e of edges) {
    const src = fromNodeKey(e.PK);
    edgeCounts.set(src, (edgeCounts.get(src) ?? 0) + 1);
  }

  return jsonResponse(200, {
    nodes: nodes.map((n) => ({ ...formatNode(n), edge_count: edgeCounts.get(n.slug) ?? 0 })),
    edges: edges.map(formatEdge),
    meta: {
      node_count: nodes.length,
      edge_count: edges.length,
      generated_at: new Date().toISOString(),
    },
  });
}

async function handleNode(slug: string, authed: boolean, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const node = await getNode(slug);
  if (!node) throw new NotFoundError(`Node '${slug}' not found`);
  if (!authed && node.visibility === "private") throw new NotFoundError(`Node '${slug}' not found`);

  const includeBody = event.queryStringParameters?.include_body === "true";

  const [outbound, inbound] = await Promise.all([getNodeEdges(slug), getInboundEdges(slug)]);

  // Fetch related node summaries via batch
  const relatedSlugs = [
    ...outbound.map((e) => fromEdgeKey(e.SK)),
    ...inbound.map((e) => fromNodeKey(e.PK)),
  ];
  const relatedMeta = await batchGetNodes(relatedSlugs);
  const relatedNodes = relatedMeta.map((rn) => ({ id: rn.slug, title: rn.title, summary: rn.summary, node_type: rn.node_type, status: rn.status }));

  // Optionally fetch body from S3
  let body: string | null = null;
  if (includeBody) {
    body = await getBody(node.node_type, slug);
  }

  return jsonResponse(200, {
    node: {
      id: node.slug,
      title: node.title,
      summary: node.summary,
      node_type: node.node_type,
      status: node.status,
      tags: node.tags,
      created_at: node.created_at,
      updated_at: node.updated_at,
      word_count: node.word_count,
    },
    edges: outbound.map((e) => ({
      target: fromEdgeKey(e.SK),
      edge_type: e.edge_type,
      weight: e.weight,
    })),
    related: relatedNodes,
    ...(body !== null && { body }),
  });
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const nodeId = event.pathParameters?.id;
    if (nodeId) return await handleNode(nodeId, await isAuthenticated(event), event);
    return await handleGraph(event);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(404, "not_found", error.message);
    }
    console.error("Graph error:", JSON.stringify(error));
    return errorResponse(500, "internal_error", "Internal server error");
  }
};
