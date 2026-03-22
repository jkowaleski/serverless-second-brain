import { getNode, putAudit } from "../../shared/dynamodb.js";
import { jsonResponse, errorResponse } from "../../shared/http.js";
import { auditTtl } from "../../shared/math.js";
import type { AuditItem } from "../../shared/types.js";

interface FlagRequest {
  slug: string;
  reason: string;
  actor?: string;
}

export const handler = async (event: Record<string, unknown>) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event;
    const { slug, reason, actor = "api" } = body as FlagRequest;

    if (!slug || !reason) return errorResponse(400, "validation_error", "slug and reason are required");

    const node = await getNode(slug);
    if (!node) return errorResponse(404, "not_found", `Node '${slug}' not found`);

    const now = new Date().toISOString();
    const audit: AuditItem = {
      PK: `AUDIT#${now}`, SK: `NODE#${slug}`,
      action: "flag", actor,
      changes: { reason, node_status: node.status, node_type: node.node_type },
      ttl: auditTtl(),
    };
    await putAudit(audit);

    return jsonResponse(200, { slug, flagged: true, reason, flagged_at: now });
  } catch (err) {
    console.error("flag_stale error:", err);
    return errorResponse(500, "internal_error", "Failed to flag node");
  }
};
