import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { getAllNodes, getAllEdges, getAllEmbeddings } from "../../shared/dynamodb.js";
import { cosine } from "../../shared/math.js";
import type { MetaItem, EdgeItem, EmbedItem } from "../../shared/types.js";

const sns = new SNSClient({});
const DIGEST_TOPIC_ARN = process.env.SNS_DIGEST_TOPIC_ARN!;

// Configurable thresholds (via env vars or defaults from event-schemas.md)
const STALE_DAYS = parseInt(process.env.STALE_DAYS ?? "7");
const MIN_EDGES = parseInt(process.env.MIN_EDGES ?? "2");
const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD ?? "0.85");
const PROMOTION_WORDS = parseInt(process.env.PROMOTION_WORDS ?? "400");
const PROMOTION_REFS = parseInt(process.env.PROMOTION_REFS ?? "3");
const GAP_OCCURRENCES = parseInt(process.env.GAP_OCCURRENCES ?? "5");

interface DigestEvent {
  source?: string;
  "detail-type"?: string;
  detail?: { run_id?: string; triggered_at?: string };
}

interface Finding<T> { items: T[]; count: number }

interface Digest {
  event: "daily_digest";
  run_id: string;
  generated_at: string;
  findings: {
    stale_seeds: { slug: string; days_stale: number }[];
    orphan_nodes: { slug: string; edge_count: number }[];
    missing_connections: { source: string; target: string; similarity: number }[];
    promotion_candidates: { slug: string; word_count: number; ref_count: number; edge_count: number }[];
    content_gaps: { tag: string; occurrences: number; has_concept: boolean }[];
  };
  summary: {
    stale_seeds: number;
    orphan_nodes: number;
    missing_connections: number;
    promotion_candidates: number;
    content_gaps: number;
  };
}

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

function findStaleSeed(nodes: MetaItem[]) {
  return nodes
    .filter((n) => n.status === "seed" && daysSince(n.updated_at) >= STALE_DAYS)
    .map((n) => ({ slug: n.slug, days_stale: daysSince(n.updated_at) }))
    .sort((a, b) => b.days_stale - a.days_stale);
}

function findOrphans(nodes: MetaItem[], edgeCounts: Map<string, number>) {
  return nodes
    .filter((n) => (edgeCounts.get(n.slug) ?? 0) < MIN_EDGES)
    .map((n) => ({ slug: n.slug, edge_count: edgeCounts.get(n.slug) ?? 0 }))
    .sort((a, b) => a.edge_count - b.edge_count);
}

function findMissingConnections(
  nodes: MetaItem[],
  embedMap: Map<string, number[]>,
  edgeSet: Set<string>,
) {
  const results: { source: string; target: string; similarity: number }[] = [];
  const slugs = nodes.map((n) => n.slug).filter((s) => embedMap.has(s));

  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i], b = slugs[j];
      if (edgeSet.has(`${a}→${b}`) || edgeSet.has(`${b}→${a}`)) continue;

      const sim = cosine(embedMap.get(a)!, embedMap.get(b)!);
      if (sim >= SIMILARITY_THRESHOLD) {
        results.push({ source: a, target: b, similarity: Math.round(sim * 100) / 100 });
      }
    }
  }
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}

function findPromotionCandidates(nodes: MetaItem[], edgeCounts: Map<string, number>, inboundCounts: Map<string, number>) {
  return nodes
    .filter((n) => {
      if (n.status !== "seed") return false;
      const words = Math.max(n.word_count_es ?? 0, n.word_count_en ?? 0);
      const refs = inboundCounts.get(n.slug) ?? 0;
      return words >= PROMOTION_WORDS && refs >= PROMOTION_REFS;
    })
    .map((n) => ({
      slug: n.slug,
      word_count: Math.max(n.word_count_es ?? 0, n.word_count_en ?? 0),
      ref_count: inboundCounts.get(n.slug) ?? 0,
      edge_count: edgeCounts.get(n.slug) ?? 0,
    }));
}

function findContentGaps(nodes: MetaItem[]) {
  const tagCounts = new Map<string, number>();
  const conceptSlugs = new Set(nodes.filter((n) => n.node_type === "concept").map((n) => n.slug));

  for (const n of nodes) {
    for (const tag of n.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return [...tagCounts.entries()]
    .filter(([tag, count]) => count >= GAP_OCCURRENCES && !conceptSlugs.has(tag))
    .map(([tag, count]) => ({ tag, occurrences: count, has_concept: false }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

function formatDigestText(digest: Digest): string {
  const lines: string[] = [];
  lines.push(`📊 Daily Knowledge Digest — ${digest.generated_at.split("T")[0]}`);
  lines.push("");

  const { findings } = digest;

  if (findings.stale_seeds.length > 0) {
    lines.push(`🌱 Stale seeds (${findings.stale_seeds.length}):`);
    for (const s of findings.stale_seeds.slice(0, 5)) {
      lines.push(`  - ${s.slug} (${s.days_stale} days old)`);
    }
    lines.push("");
  }

  if (findings.orphan_nodes.length > 0) {
    lines.push(`🏝️ Orphan nodes (${findings.orphan_nodes.length}):`);
    for (const o of findings.orphan_nodes.slice(0, 5)) {
      lines.push(`  - ${o.slug} (${o.edge_count} edges)`);
    }
    lines.push("");
  }

  if (findings.missing_connections.length > 0) {
    lines.push(`🔗 Missing connections (${findings.missing_connections.length}):`);
    for (const m of findings.missing_connections.slice(0, 5)) {
      lines.push(`  - ${m.source} ↔ ${m.target} (similarity: ${m.similarity})`);
    }
    lines.push("");
  }

  if (findings.promotion_candidates.length > 0) {
    lines.push(`📈 Ready to promote (${findings.promotion_candidates.length}):`);
    for (const p of findings.promotion_candidates) {
      lines.push(`  - ${p.slug}: ${p.word_count} words, ${p.ref_count} refs, ${p.edge_count} edges`);
    }
    lines.push("");
  }

  if (findings.content_gaps.length > 0) {
    lines.push(`🕳️ Content gaps (${findings.content_gaps.length}):`);
    for (const g of findings.content_gaps.slice(0, 5)) {
      lines.push(`  - Tag "${g.tag}" appears ${g.occurrences} times but has no concept node`);
    }
    lines.push("");
  }

  const total = Object.values(digest.summary).reduce((a, b) => a + b, 0);
  if (total === 0) {
    lines.push("✨ No findings — the knowledge graph is healthy!");
  }

  return lines.join("\n");
}

export const handler = async (event: DigestEvent) => {
  const runId = event.detail?.run_id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  console.log(JSON.stringify({ event: "surfacing_start", run_id: runId }));

  // Load all data
  const [nodes, edges, embeddings] = await Promise.all([
    getAllNodes(),
    getAllEdges(),
    getAllEmbeddings(),
  ]);

  // Build lookup structures
  const edgeCounts = new Map<string, number>();
  const inboundCounts = new Map<string, number>();
  const edgeSet = new Set<string>();

  for (const e of edges) {
    const src = e.PK.replace("NODE#", "");
    const tgt = e.SK.replace("EDGE#", "");
    edgeCounts.set(src, (edgeCounts.get(src) ?? 0) + 1);
    inboundCounts.set(tgt, (inboundCounts.get(tgt) ?? 0) + 1);
    edgeSet.add(`${src}→${tgt}`);
  }

  const embedMap = new Map<string, number[]>();
  for (const e of embeddings) {
    embedMap.set(e.PK.replace("NODE#", ""), e.vector);
  }

  // Run all analyzers
  const stale_seeds = findStaleSeed(nodes);
  const orphan_nodes = findOrphans(nodes, edgeCounts);
  const missing_connections = findMissingConnections(nodes, embedMap, edgeSet);
  const promotion_candidates = findPromotionCandidates(nodes, edgeCounts, inboundCounts);
  const content_gaps = findContentGaps(nodes);

  const digest: Digest = {
    event: "daily_digest",
    run_id: runId,
    generated_at: now,
    findings: { stale_seeds, orphan_nodes, missing_connections, promotion_candidates, content_gaps },
    summary: {
      stale_seeds: stale_seeds.length,
      orphan_nodes: orphan_nodes.length,
      missing_connections: missing_connections.length,
      promotion_candidates: promotion_candidates.length,
      content_gaps: content_gaps.length,
    },
  };

  console.log(JSON.stringify({ event: "surfacing_complete", run_id: runId, summary: digest.summary }));

  // Publish to SNS — human-readable text + JSON for integrations
  await sns.send(new PublishCommand({
    TopicArn: DIGEST_TOPIC_ARN,
    Subject: `Knowledge Digest — ${now.split("T")[0]}`,
    Message: formatDigestText(digest),
    MessageAttributes: {
      digest_json: { DataType: "String", StringValue: JSON.stringify(digest) },
    },
  }));

  return digest;
};
