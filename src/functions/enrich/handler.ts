/**
 * Async enrichment Lambda — generates body content, embedding, and edges.
 * Invoked asynchronously by capture Lambda after META write.
 */
import { generateBody, embed } from "../../shared/bedrock.js";
import { putEmbed, putEdge, updateNodeMeta, bumpCacheVersion } from "../../shared/dynamodb.js";
import { putBody } from "../../shared/s3.js";
import { nodeKey, edgeKey } from "../../shared/keys.js";
import type { EmbedItem, EdgeItem } from "../../shared/types.js";

interface EnrichEvent {
  slug: string;
  text: string;
  node_type: string;
  title: string;
  summary: string;
  tags: string[];
  concepts: string[];
  actor: string;
}

export const handler = async (event: EnrichEvent): Promise<void> => {
  const { slug, text, node_type, title, summary, tags, concepts, actor } = event;
  const now = new Date().toISOString();

  console.log(JSON.stringify({ event: "enrich_start", slug }));

  // Generate body
  const { body } = await generateBody(text, node_type, title, tags);

  // Write body to S3
  await putBody(node_type, slug, body);

  // Update word count on META
  const wc = body.split(/\s+/).filter(Boolean).length;
  await updateNodeMeta(slug, { word_count: wc });

  // Generate embedding from combined text
  const embedText = `${title} ${summary} ${tags.join(" ")}`;
  const vector = await embed(embedText);

  const embedItem: EmbedItem = {
    PK: nodeKey(slug),
    SK: "EMBED",
    model: process.env.BEDROCK_EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0",
    dimensions: vector.length,
    vector,
    source_text: embedText,
    generated_at: now,
  };
  await putEmbed(embedItem);

  // Create edges for suggested cross-references
  for (const target of concepts) {
    const edge: EdgeItem = {
      PK: nodeKey(slug), SK: edgeKey(target),
      edge_type: "related", weight: 1.0,
      created_at: now, created_by: actor,
    };
    await putEdge(edge);
  }

  await bumpCacheVersion();
  console.log(JSON.stringify({ event: "enrich_complete", slug, word_count: wc, edges: concepts.length }));
};
