import { getNode, putEdge, putAudit } from "../../shared/dynamodb.js";
import type { EdgeItem, AuditItem } from "../../shared/types.js";

interface ConnectRequest {
  source: string;
  target: string;
  edge_type?: string;
  weight?: number;
  actor?: string;
}

const CORS_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? "*";
const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN };

export const handler = async (event: Record<string, unknown>) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event;
    const { source, target, edge_type = "related", weight = 1.0, actor = "api" } = body as ConnectRequest;

    if (!source || !target) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "validation_error", message: "source and target are required" }) };
    }
    if (source === target) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "validation_error", message: "source and target must be different" }) };
    }

    // Verify both nodes exist
    const [srcNode, tgtNode] = await Promise.all([getNode(source), getNode(target)]);
    if (!srcNode) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "not_found", message: `Node '${source}' not found` }) };
    if (!tgtNode) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "not_found", message: `Node '${target}' not found` }) };

    const now = new Date().toISOString();

    // Create bidirectional edges
    const fwd: EdgeItem = { PK: `NODE#${source}`, SK: `EDGE#${target}`, edge_type, weight, created_at: now, created_by: actor };
    const rev: EdgeItem = { PK: `NODE#${target}`, SK: `EDGE#${source}`, edge_type, weight, created_at: now, created_by: actor };
    await Promise.all([putEdge(fwd), putEdge(rev)]);

    // Audit trail
    const audit: AuditItem = {
      PK: `AUDIT#${now}`, SK: `NODE#${source}`,
      action: "connect", actor,
      changes: { source, target, edge_type, weight },
      ttl: Math.floor(Date.now() / 1000) + 90 * 86400,
    };
    await putAudit(audit);

    return {
      statusCode: 201,
      headers: HEADERS,
      body: JSON.stringify({ source, target, edge_type, weight, created_at: now }),
    };
  } catch (err) {
    console.error("connect_nodes error:", err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "internal_error", message: "Failed to create edge" }) };
  }
};
