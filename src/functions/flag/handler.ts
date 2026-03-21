import { getNode, putAudit } from "../../shared/dynamodb.js";
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

    if (!slug || !reason) {
      return { statusCode: 400, body: JSON.stringify({ error: "validation_error", message: "slug and reason are required" }) };
    }

    const node = await getNode(slug);
    if (!node) return { statusCode: 404, body: JSON.stringify({ error: "not_found", message: `Node '${slug}' not found` }) };

    const now = new Date().toISOString();
    const audit: AuditItem = {
      PK: `AUDIT#${now}`, SK: `NODE#${slug}`,
      action: "flag", actor,
      changes: { reason, node_status: node.status, node_type: node.node_type },
      ttl: Math.floor(Date.now() / 1000) + 90 * 86400,
    };
    await putAudit(audit);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, flagged: true, reason, flagged_at: now }),
    };
  } catch (err) {
    console.error("flag_stale error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "internal_error", message: "Failed to flag node" }) };
  }
};
