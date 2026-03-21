#!/usr/bin/env npx tsx
/**
 * Backfill embeddings for all nodes missing EMBED items.
 *
 * Usage:
 *   TABLE_NAME=ssb-dev-knowledge-graph npx tsx scripts/backfill-embeddings.ts
 *
 * Options:
 *   --dry-run    Print what would be processed without calling Bedrock
 *   --limit N    Max nodes to process (default: all)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const TABLE_NAME = process.env.TABLE_NAME!;
const REGION = process.env.AWS_REGION ?? "us-east-1";
const MODEL_ID = process.env.BEDROCK_EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv[process.argv.indexOf("--limit") + 1] || "0") || Infinity;
const CONCURRENCY = 2;
const BATCH_DELAY_MS = 1500;

if (!DRY_RUN && !TABLE_NAME) {
  console.error("TABLE_NAME required (or use --dry-run)");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const bedrock = new BedrockRuntimeClient({ region: REGION });

async function getAllMeta() {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "META" },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(r.Items ?? []));
    lastKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

async function hasEmbed(slug: string): Promise<boolean> {
  const r = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `NODE#${slug}`, SK: "EMBED" },
    ProjectionExpression: "PK",
  }));
  return !!r.Item;
}

async function generateAndStore(node: Record<string, unknown>): Promise<boolean> {
  const slug = node.slug as string;
  const text = `${node.title} ${node.summary_es} ${node.summary_en} ${(node.tags as string[]).join(" ")}`;

  if (DRY_RUN) {
    console.log(`  [DRY] Would embed: ${slug}`);
    return true;
  }

  const resp = await bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: text }),
  }));

  const body = JSON.parse(new TextDecoder().decode(resp.body));
  const vector = body.embedding as number[];

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `NODE#${slug}`,
      SK: "EMBED",
      model: MODEL_ID,
      dimensions: vector.length,
      vector,
      source_text: text.substring(0, 500),
      generated_at: new Date().toISOString(),
    },
  }));

  console.log(`  OK: ${slug} (${vector.length} dims)`);
  return true;
}

async function main() {
  console.log(`\nBackfill embeddings → DynamoDB(${TABLE_NAME ?? "dry"})`);
  if (DRY_RUN) console.log("MODE: dry-run\n");

  const nodes = await getAllMeta();
  console.log(`Found ${nodes.length} nodes\n`);

  // Find nodes missing embeddings
  const missing: Record<string, unknown>[] = [];
  for (const node of nodes) {
    if (missing.length >= LIMIT) break;
    if (DRY_RUN || !(await hasEmbed(node.slug as string))) {
      missing.push(node);
    }
  }
  console.log(`Missing embeddings: ${missing.length}\n`);

  let processed = 0, errors = 0;

  // Process in batches to respect Bedrock rate limits
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(generateAndStore));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) processed++;
      else { errors++; console.error(`  ERROR:`, r.status === "rejected" ? r.reason : "unknown"); }
    }
    if (i + CONCURRENCY < missing.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n--- Summary ---`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors:    ${errors}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
