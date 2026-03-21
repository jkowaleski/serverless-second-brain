/**
 * Monolithic capture handler — DEPRECATED for production use.
 *
 * Production flow: API Gateway → Step Functions → step handlers (steps/).
 * This handler is kept for direct Lambda invocation and local testing only.
 * If modifying capture logic, update the step handlers in steps/ instead.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { validateCaptureRequest, generateSlug } from "../../shared/validation.js";
import { getNode, putNode, putEdge, putAudit, listNodeSlugs } from "../../shared/dynamodb.js";
import { putBody } from "../../shared/s3.js";
import { classify } from "../../shared/bedrock.js";
import { ValidationError, DuplicateError, BedrockError } from "../../shared/errors.js";
import type { MetaItem, EdgeItem, AuditItem, CaptureResponse } from "../../shared/types.js";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const input = validateCaptureRequest(JSON.parse(event.body ?? "{}"));
    const existingSlugs = await listNodeSlugs();
    const metadata = await classify(input.text, existingSlugs, input.language ?? "es");
    const slug = generateSlug(metadata.title);
    const now = new Date().toISOString();
    const nodeType = input.type ?? "concept";

    // Check duplicate
    const existing = await getNode(slug);
    if (existing) {
      throw new DuplicateError(`Node with slug '${slug}' already exists`);
    }

    // Write META item
    const meta: MetaItem = {
      PK: `NODE#${slug}`,
      SK: "META",
      GSI2PK: `STATUS#seed`,
      slug,
      node_type: nodeType,
      status: "seed",
      title: metadata.title,
      title_es: metadata.title_es,
      title_en: metadata.title_en,
      summary_es: metadata.summary_es,
      summary_en: metadata.summary_en,
      tags: metadata.tags,
      created_at: now,
      updated_at: now,
      created_by: "human",
      word_count_es: input.language === "es" ? input.text.split(/\s+/).length : 0,
      word_count_en: input.language === "en" ? input.text.split(/\s+/).length : 0,
    };

    try {
      await putNode(meta);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new DuplicateError(`Node with slug '${slug}' already exists`);
      }
      throw err;
    }

    // Write body to S3
    await putBody(nodeType, slug, input.text, input.language ?? "es");

    // Write edges for suggested cross-references
    for (const target of metadata.concepts) {
      const edge: EdgeItem = {
        PK: `NODE#${slug}`,
        SK: `EDGE#${target}`,
        edge_type: "related",
        weight: 1.0,
        created_at: now,
        created_by: "human",
      };
      await putEdge(edge);
    }

    // Audit trail
    const audit: AuditItem = {
      PK: `AUDIT#${now}`,
      SK: `NODE#${slug}`,
      action: "create",
      actor: "human",
      changes: { node_type: nodeType, status: "seed" },
      ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };
    await putAudit(audit);

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

    return { statusCode: 201, body: JSON.stringify(response) };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { statusCode: 400, body: JSON.stringify({ error: "validation_error", message: error.message }) };
    }
    if (error instanceof DuplicateError) {
      return { statusCode: 409, body: JSON.stringify({ error: "duplicate_slug", message: error.message }) };
    }
    if (error instanceof BedrockError) {
      return { statusCode: 503, body: JSON.stringify({ error: "bedrock_unavailable", message: error.message }) };
    }
    console.error("Unhandled error:", JSON.stringify(error));
    return { statusCode: 500, body: JSON.stringify({ error: "internal_error", message: "Internal server error" }) };
  }
};
