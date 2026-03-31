#!/usr/bin/env npx tsx
/**
 * Migration script: import jonmatum.com MDX content → DynamoDB + S3
 *
 * Usage:
 *   TABLE_NAME=ssb-dev-knowledge-graph BUCKET_NAME=ssb-dev-content npx tsx scripts/migrate.ts [content-dir]
 *
 * Options:
 *   --dry-run    Print what would be written without writing
 *   --skip-s3    Skip S3 uploads (metadata only)
 *
 * Idempotent: uses DynamoDB conditional writes (attribute_not_exists).
 * Safe to re-run — skips existing nodes.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { glob } from "glob";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const REGION = process.env.AWS_REGION ?? "us-east-1";
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_S3 = process.argv.includes("--skip-s3");

if (!DRY_RUN && (!TABLE_NAME || !BUCKET_NAME)) {
  console.error("TABLE_NAME and BUCKET_NAME env vars required (or use --dry-run)");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

interface ContentMeta {
  type: string;
  title: string;
  summary: string;
  concepts: string[];
  status: string;
  tags: string[];
  created: string;
  updated: string;
}

interface ContentNode {
  id: string;
  slug: string;
  meta: ContentMeta;
  body: string;
}

async function parseContent(contentDir: string): Promise<ContentNode[]> {
  const files = await glob("**/*.mdx", { cwd: contentDir, ignore: "**/*.en.mdx" });
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(contentDir, file), "utf-8");
    const { data, content } = matter(raw);
    const slug = file.replace(/\.mdx$/, "").replace(/\//g, "-");
    return { id: slug, slug, meta: data as ContentMeta, body: content };
  });
}

async function writeNode(node: ContentNode): Promise<{ written: boolean; edges: number }> {
  const { slug, meta, body } = node;
  const nodeType = meta.type ?? "concept";

  // META item
  const metaItem = {
    PK: `NODE#${slug}`,
    SK: "META",
    GSI2PK: `STATUS#${meta.status}`,
    slug,
    node_type: nodeType,
    status: meta.status,
    title: meta.title,
    summary: meta.summary,
    tags: meta.tags ?? [],
    created_at: new Date(meta.created).toISOString(),
    updated_at: new Date(meta.updated).toISOString(),
    created_by: "migration",
    word_count: body.split(/\s+/).length,
  };

  if (DRY_RUN) {
    console.log(`  [DRY] Would write META: ${slug} (${nodeType}, ${meta.status})`);
    console.log(`  [DRY] Would write ${meta.concepts?.length ?? 0} edges`);
    return { written: true, edges: meta.concepts?.length ?? 0 };
  }

  // Conditional write — skip if exists
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: metaItem,
      ConditionExpression: "attribute_not_exists(PK)",
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      console.log(`  SKIP: ${slug} (already exists)`);
      return { written: false, edges: 0 };
    }
    throw err;
  }

  // S3 body upload
  if (!SKIP_S3) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `content/${nodeType}/${slug}/body.mdx`,
      Body: body,
      ContentType: "text/markdown",
    }));
  }

  // Edge items
  const edges = meta.concepts ?? [];
  for (const target of edges) {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `NODE#${slug}`,
        SK: `EDGE#${target}`,
        edge_type: "related",
        weight: 1.0,
        created_at: metaItem.created_at,
        created_by: "migration",
      },
    }));
  }

  // Audit item
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `AUDIT#${now}`,
      SK: `NODE#${slug}`,
      action: "migrate",
      actor: "migration-script",
      changes: { source: "jonmatum.com", node_type: nodeType, status: meta.status },
      ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    },
  }));

  return { written: true, edges: edges.length };
}

async function main() {
  const contentDir = process.argv.find((a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1])
    ?? path.resolve(process.cwd(), "../jonmatum.com/content");

  console.log(`\nMigration: ${contentDir} → DynamoDB(${TABLE_NAME ?? "dry"}) + S3(${BUCKET_NAME ?? "dry"})`);
  if (DRY_RUN) console.log("MODE: dry-run\n");

  const nodes = await parseContent(contentDir);
  console.log(`Found ${nodes.length} nodes\n`);

  let written = 0, skipped = 0, totalEdges = 0, errors = 0;

  for (const node of nodes) {
    try {
      const result = await writeNode(node);
      if (result.written) { written++; totalEdges += result.edges; }
      else skipped++;
      if (!DRY_RUN) console.log(`  OK: ${node.slug} (${node.meta.type}, ${result.edges} edges)`);
    } catch (err) {
      errors++;
      console.error(`  ERROR: ${node.slug}:`, err);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total:   ${nodes.length}`);
  console.log(`Written: ${written}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Edges:   ${totalEdges}`);
  console.log(`Errors:  ${errors}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
