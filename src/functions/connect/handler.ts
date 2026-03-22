import { getNode, putEdge, putAudit } from "../../shared/dynamodb.js";
import { jsonResponse, errorResponse } from "../../shared/http.js";
import { auditTtl } from "../../shared/math.js";
import { nodeKey, edgeKey, auditKey } from "../../shared/keys.js";
import type { EdgeItem, AuditItem } from "../../shared/types.js";

interface ConnectRequest {
  source: string;
  target: string;
  edge_type?: string;
  weight?: number;
  actor?: string;
}

export const handler = async (event: Record<string, unknown>) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event;
    const { source, target, edge_type = "related", weight = 1.0, actor = "api" } = body as ConnectRequest;

    if (!source || !target) return errorResponse(400, "validation_error", "source and target are required");
    if (source === target) return errorResponse(400, "validation_error", "source and target must be different");

    const [srcNode, tgtNode] = await Promise.all([getNode(source), getNode(target)]);
    if (!srcNode) return errorResponse(404, "not_found", `Node '${source}' not found`);
    if (!tgtNode) return errorResponse(404, "not_found", `Node '${target}' not found`);

    const now = new Date().toISOString();

    const fwd: EdgeItem = { PK: nodeKey(source), SK: edgeKey(target), edge_type, weight, created_at: now, created_by: actor };
    const rev: EdgeItem = { PK: nodeKey(target), SK: edgeKey(source), edge_type, weight, created_at: now, created_by: actor };
    await Promise.all([putEdge(fwd), putEdge(rev)]);

    const audit: AuditItem = {
      PK: auditKey(now), SK: nodeKey(source),
      action: "connect", actor,
      changes: { source, target, edge_type, weight },
      ttl: auditTtl(),
    };
    await putAudit(audit);

    return jsonResponse(201, { source, target, edge_type, weight, created_at: now });
  } catch (err) {
    console.error("connect_nodes error:", err);
    return errorResponse(500, "internal_error", "Failed to create edge");
  }
};
