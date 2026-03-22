/**
 * Monolithic capture handler — API Gateway Lambda proxy integration.
 *
 * Handles the full capture pipeline: validate → classify → persist → edges.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { validateCaptureRequest, generateSlug } from "../../shared/validation.js";
import { getNode, putNode, putEdge, putAudit, listNodeSlugs, bumpCacheVersion, updateNodeVisibility } from "../../shared/dynamodb.js";
import { putBody } from "../../shared/s3.js";
import { classify } from "../../shared/bedrock.js";
import { jsonResponse, errorResponse, corsHeaders } from "../../shared/http.js";
import { auditTtl } from "../../shared/math.js";
import { ValidationError, DuplicateError, BedrockError, NotFoundError } from "../../shared/errors.js";
import type { MetaItem, EdgeItem, AuditItem, CaptureResponse } from "../../shared/types.js";

const CORS = corsHeaders("POST,PATCH,OPTIONS");

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  if (method === "PATCH") return handlePatch(event);
  return handleCapture(event);
};

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
      PK: `NODE#${slug}`,
      SK: "META",
      GSI2PK: `STATUS#seed`,
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
        PK: `NODE#${slug}`,
        SK: `EDGE#${target}`,
        edge_type: "related",
        weight: 1.0,
        created_at: now,
        created_by: actor,
      };
      await putEdge(edge);
    }

    // Audit trail
    const audit: AuditItem = {
      PK: `AUDIT#${now}`,
      SK: `NODE#${slug}`,
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
};
