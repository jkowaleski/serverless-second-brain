/**
 * Monolithic capture handler — API Gateway Lambda proxy integration.
 *
 * Handles the full capture pipeline: validate → classify → persist → edges.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { validateCaptureRequest, generateSlug } from "../../shared/validation.js";
import { getNode, putNode, putEdge, putAudit, listNodeSlugs, bumpCacheVersion, updateNodeVisibility, updateNodeMeta, deleteNode, getNodeEdges } from "../../shared/dynamodb.js";
import { putBody, getBody, deleteBody } from "../../shared/s3.js";
import { classify, nodeChat } from "../../shared/bedrock.js";
import type { NodeContext } from "../../shared/bedrock.js";
import { jsonResponse, errorResponse, corsHeaders } from "../../shared/http.js";
import { auditTtl } from "../../shared/math.js";
import { nodeKey, edgeKey, auditKey, statusKey, fromEdgeKey, META } from "../../shared/keys.js";
import { ValidationError, DuplicateError, BedrockError, NotFoundError } from "../../shared/errors.js";
import type { MetaItem, EdgeItem, AuditItem, CaptureResponse, NodeChatAction } from "../../shared/types.js";

const CORS = corsHeaders("POST,PATCH,OPTIONS");

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  if (method === "PATCH") return handlePatch(event);
  const body = JSON.parse(event.body ?? "{}");
  if (body.action === "chat") return handleChat(event, body);
  return handleCapture(event);
};

async function handleChat(event: APIGatewayProxyEvent, body: { slug?: string; message?: string; language?: string }): Promise<APIGatewayProxyResult> {
  try {
    const { slug, message, language = "es" } = body;
    if (!slug || !message) throw new ValidationError("slug and message are required");

    // Load full node context
    const node = await getNode(slug);
    if (!node) throw new NotFoundError(`Node '${slug}' not found`);

    const [bodyEs, bodyEn] = await Promise.all([
      getBody(node.node_type, slug, "es").catch(() => ""),
      getBody(node.node_type, slug, "en").catch(() => ""),
    ]);

    // Get edges
    const edges = await getNodeEdges(slug);
    const edgeSlugs = edges.map((e) => fromEdgeKey(e.SK));

    const context: NodeContext = {
      slug, node_type: node.node_type, status: node.status,
      visibility: node.visibility ?? "private",
      title: node.title, title_es: node.title_es, title_en: node.title_en,
      summary_es: node.summary_es, summary_en: node.summary_en,
      tags: node.tags, body_es: bodyEs || "", body_en: bodyEn || "",
      edges: edgeSlugs,
    };

    const result = await nodeChat(message, context, language);
    const now = new Date().toISOString();

    // Execute the action
    if (result.action === "update_body" && result.body_es && result.body_en) {
      await Promise.all([
        putBody(node.node_type, slug, result.body_es, "es"),
        putBody(node.node_type, slug, result.body_en, "en"),
      ]);
      const wcEs = result.body_es.split(/\s+/).filter(Boolean).length;
      const wcEn = result.body_en.split(/\s+/).filter(Boolean).length;
      await updateNodeMeta(slug, { word_count_es: wcEs, word_count_en: wcEn });
    }

    if (result.action === "update_meta" && result.meta) {
      await updateNodeMeta(slug, result.meta);
    }

    if (result.action === "add_edge" && result.edge) {
      const edgeItem: EdgeItem = {
        PK: nodeKey(slug), SK: edgeKey(result.edge.target),
        edge_type: result.edge.edge_type ?? "related", weight: 1.0,
        created_at: now, created_by: "human",
      };
      await putEdge(edgeItem);
    }

    if (result.action === "set_visibility" && result.visibility) {
      await updateNodeVisibility(slug, result.visibility);
    }

    if (result.action === "set_status" && result.status) {
      await updateNodeMeta(slug, { status: result.status, GSI2PK: statusKey(result.status) });
    }

    if (result.action === "delete") {
      await deleteNode(slug);
      await deleteBody(node.node_type, slug).catch(() => {});
    }

    if (result.action !== "none") {
      const audit: AuditItem = {
        PK: auditKey(now), SK: nodeKey(slug),
        action: "update", actor: "human",
        changes: { chat_action: result.action, message },
        ttl: auditTtl(),
      };
      await putAudit(audit);
      await bumpCacheVersion();
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (error) {
    if (error instanceof ValidationError) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "validation_error", message: error.message }) };
    if (error instanceof NotFoundError) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: "not_found", message: error.message }) };
    if (error instanceof BedrockError) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "bedrock_unavailable", message: error.message }) };
    console.error("Chat error:", JSON.stringify(error));
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "internal_error", message: "Internal server error" }) };
  }
}

async function handlePatch(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { slug, visibility } = JSON.parse(event.body ?? "{}");
    if (!slug || !["public", "private"].includes(visibility)) {
      throw new ValidationError("slug and visibility (public|private) are required");
    }
    const node = await getNode(slug);
    if (!node) throw new NotFoundError(`Node '${slug}' not found`);

    await updateNodeVisibility(slug, visibility);
    await bumpCacheVersion();

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ slug, visibility }) };
  } catch (error) {
    if (error instanceof ValidationError) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "validation_error", message: error.message }) };
    if (error instanceof NotFoundError) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: "not_found", message: error.message }) };
    console.error("Patch error:", JSON.stringify(error));
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "internal_error", message: "Internal server error" }) };
  }
}

async function handleCapture(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const input = validateCaptureRequest(JSON.parse(event.body ?? "{}"));
    const recentSlugs = await listNodeSlugs(20);
    const metadata = await classify(input.text, recentSlugs, input.language ?? "es");
    const slug = generateSlug(metadata.title);
    const now = new Date().toISOString();
    const validTypes = ["concept", "note", "experiment", "essay"];
    const detectedType = metadata.node_type && validTypes.includes(metadata.node_type) ? metadata.node_type : "concept";
    const nodeType = input.type ?? detectedType;
    const actor = input.actor ?? "human";

    // Check duplicate
    const existing = await getNode(slug);
    if (existing) {
      throw new DuplicateError(`Node with slug '${slug}' already exists`);
    }

    // Write META item
    const defaultVisibility = (process.env.DEFAULT_VISIBILITY ?? "private") as "public" | "private";
    const meta: MetaItem = {
      PK: nodeKey(slug),
      SK: META,
      GSI2PK: statusKey("seed"),
      slug,
      node_type: nodeType,
      status: "seed",
      visibility: input.visibility ?? defaultVisibility,
      title: metadata.title,
      title_es: metadata.title_es,
      title_en: metadata.title_en,
      summary_es: metadata.summary_es,
      summary_en: metadata.summary_en,
      tags: metadata.tags,
      created_at: now,
      updated_at: now,
      created_by: actor,
      word_count_es: (metadata.body_es || "").split(/\s+/).filter(Boolean).length,
      word_count_en: (metadata.body_en || "").split(/\s+/).filter(Boolean).length,
    };

    try {
      await putNode(meta);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new DuplicateError(`Node with slug '${slug}' already exists`);
      }
      throw err;
    }

    // Write body to S3 (Bedrock-generated content, both languages)
    const bodyEs = metadata.body_es || input.text;
    const bodyEn = metadata.body_en || input.text;
    await putBody(nodeType, slug, bodyEs, "es");
    await putBody(nodeType, slug, bodyEn, "en");

    // Write edges for suggested cross-references
    for (const target of metadata.concepts) {
      const edge: EdgeItem = {
        PK: nodeKey(slug),
        SK: edgeKey(target),
        edge_type: "related",
        weight: 1.0,
        created_at: now,
        created_by: actor,
      };
      await putEdge(edge);
    }

    // Audit trail
    const audit: AuditItem = {
      PK: auditKey(now),
      SK: nodeKey(slug),
      action: "create",
      actor,
      changes: { node_type: nodeType, status: "seed" },
      ttl: auditTtl(),
    };
    await putAudit(audit);
    await bumpCacheVersion();

    const response: CaptureResponse = {
      id: slug,
      slug,
      node_type: nodeType,
      status: "seed",
      title: metadata.title,
      title_es: metadata.title_es,
      title_en: metadata.title_en,
      summary_es: metadata.summary_es,
      summary_en: metadata.summary_en,
      tags: metadata.tags,
      concepts: metadata.concepts,
      created_at: now,
      updated_at: now,
    };

    return { statusCode: 201, headers: CORS, body: JSON.stringify(response) };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "validation_error", message: error.message }) };
    }
    if (error instanceof DuplicateError) {
      return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: "duplicate_slug", message: error.message }) };
    }
    if (error instanceof BedrockError) {
      return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "bedrock_unavailable", message: error.message }) };
    }
    console.error("Unhandled error:", JSON.stringify(error));
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "internal_error", message: "Internal server error" }) };
  }
}
