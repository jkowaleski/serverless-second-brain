import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ClassificationResult } from "./types.js";
import { BedrockError } from "./errors.js";

const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID!;
const CLASSIFY_MODEL_ID = process.env.BEDROCK_CLASSIFY_MODEL_ID || MODEL_ID;
const EMBEDDING_MODEL_ID = process.env.BEDROCK_EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const TRANSIENT_ERRORS = ["ThrottlingException", "TooManyRequestsException", "ServiceUnavailableException", "ModelTimeoutException"];

async function invokeWithRetry(params: { modelId: string; body: string }): Promise<Uint8Array> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await bedrock.send(new InvokeModelCommand({
        modelId: params.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: params.body,
      }));
      return response.body;
    } catch (err: unknown) {
      const errorName = (err as { name?: string }).name ?? "";
      const isTransient = TRANSIENT_ERRORS.some((e) => errorName.includes(e));

      if (!isTransient || attempt === MAX_RETRIES) {
        throw new BedrockError(`Bedrock ${params.modelId}: ${errorName} — ${(err as Error).message}`);
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`Bedrock throttled (${errorName}), retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new BedrockError("Bedrock: max retries exceeded");
}

function parseJson<T>(content: string): T {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new BedrockError("No JSON found in Bedrock response");
  return JSON.parse(jsonMatch[0]) as T;
}

function extractContent(body: Uint8Array): string {
  const parsed = JSON.parse(new TextDecoder().decode(body));
  const text = parsed.content?.[0]?.text;
  if (!text) throw new BedrockError("Empty response from Bedrock");
  return text;
}

/**
 * Phase 1 — Fast classify. Metadata only, no body generation.
 * Target: <5s Bedrock response.
 */
export async function classify(
  text: string,
  recentSlugs: string[],
): Promise<ClassificationResult> {
  const slugHint = recentSlugs.length > 0
    ? `\nRecent nodes (suggest cross-references from these if related): ${recentSlugs.join(", ")}`
    : "";

  const prompt = `You are a knowledge graph classifier for a personal knowledge base covering any domain.

Classify this text and generate metadata. Do NOT generate body content — only metadata.

Text: ${text}${slugHint}

Respond with ONLY valid JSON:
{
  "node_type": "concept | note | experiment | essay",
  "title": "short title",
  "summary": "2-3 sentence summary",
  "tags": ["tag1", "tag2", "tag3"],
  "concepts": ["existing-slug-1"]
}

## Node type rules
- concept: reusable idea, pattern, or technology
- note: observation, TIL, or snippet
- experiment: project, trial, or proof-of-concept
- essay: long-form argument or reflection

## Rules
- Title: concise, no articles
- Summary: one concrete sentence, specific not generic
- Tags: 3-7 lowercase, hyphenated
- Concepts: only slugs from the recent nodes list that are genuinely related (empty array if none)
- No filler: "game-changer", "increasingly important", "revolutionizing"`;

  const responseBody = await invokeWithRetry({
    modelId: CLASSIFY_MODEL_ID,
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  return parseJson<ClassificationResult>(extractContent(responseBody));
}

/**
 * Phase 2 — Async body generation. Called by enrich Lambda, no timeout pressure.
 */
export async function generateBody(
  text: string,
  nodeType: string,
  title: string,
  tags: string[],
): Promise<{ body: string }> {
  const prompt = `You are a content writer for a personal knowledge base. Generate the full body content for a ${nodeType} node.

## Source material
${text}

## Node metadata
- Title: ${title}
- Tags: ${tags.join(", ")}

## Content structure

${nodeType === "concept" ? `For concepts:
- ## What it is — precise definition (2-3 paragraphs)
- ## [Domain sections] — at least 2 substantive sections with real depth
- ## Why it matters — practical perspective, specific tradeoffs
- Include at least ONE of: comparison table, code example, mermaid diagram, or decision framework` :
nodeType === "note" ? `For notes: shorter, 1-3 sections, focused on the discovery` :
nodeType === "experiment" ? `For experiments: what was tried, results, what was learned` :
`For essays: thesis, argument sections, conclusion`}

## Quality rules
- Write like an expert explaining to a peer, never like a tutorial or Wikipedia
- Technology topics: staff+ engineer depth. Non-technology: expert practitioner depth
- Be specific and practical — no generic descriptions
- NEVER use filler: "in today's fast-paced world", "increasingly important", "game-changer"
- Seed quality: 200-600 words for concepts, shorter for notes

## Mermaid diagrams (if used)
- Alphanumeric IDs only (no hyphens/dots in IDs), labels in brackets: NodeId["Label"]
- accTitle + accDescr required as first two lines after diagram type
- No empty lines inside diagram blocks, no HTML tags

Respond with ONLY valid JSON:
{
  "body": "full MDX content"
}`;

  const responseBody = await invokeWithRetry({
    modelId: MODEL_ID,
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  return parseJson<{ body: string }>(extractContent(responseBody));
}

export async function embed(text: string): Promise<number[]> {
  const responseBody = await invokeWithRetry({
    modelId: EMBEDDING_MODEL_ID,
    body: JSON.stringify({ inputText: text }),
  });

  const body = JSON.parse(new TextDecoder().decode(responseBody));
  const vector = body.embedding;

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new BedrockError("Empty embedding from Bedrock Titan");
  }

  return vector as number[];
}

export interface NodeContext {
  slug: string;
  node_type: string;
  status: string;
  visibility: string;
  title: string;
  summary: string;
  tags: string[];
  body: string;
  edges: string[];
}

export async function nodeChat(message: string, context: NodeContext): Promise<import("./types.js").NodeChatAction> {
  const prompt = `You are a knowledge graph editor. The user wants to modify a node in their personal knowledge base.

## Current node
- Slug: ${context.slug}
- Type: ${context.node_type}
- Status: ${context.status}
- Visibility: ${context.visibility}
- Title: ${context.title}
- Tags: ${context.tags.join(", ")}
- Connected to: ${context.edges.join(", ") || "none"}

## Current summary
${context.summary}

## Current body
${context.body}

## User instruction
${message}

## Rules
- If the user asks to update/rewrite/add content, return action "update_body" with COMPLETE new body (not just the changed section — return the full body)
- If the user asks to change title, summary, or tags, return action "update_meta" with only the changed fields
- If the user asks to connect to another node, return action "add_edge" with the target slug
- If the user asks to change visibility, return action "set_visibility"
- If the user asks to promote/change status, return action "set_status"
- If the user asks to delete, return action "delete"
- If the user asks a question or the instruction is unclear, return action "none" with a helpful message
- message: brief confirmation of what you did (or will do)
- For body content: no filler phrases, no generic descriptions
- Mermaid diagrams: alphanumeric IDs only, quoted labels with special chars, accTitle + accDescr required

## Response format (JSON only, no markdown wrapping)
{
  "action": "update_body" | "update_meta" | "add_edge" | "set_visibility" | "set_status" | "delete" | "none",
  "body": "...",
  "meta": { "title": "...", "tags": [...] },
  "edge": { "target": "slug", "edge_type": "related" },
  "visibility": "public" | "private",
  "status": "seed" | "growing" | "evergreen",
  "message": "..."
}
Only include fields relevant to the action. Always include message.`;

  const responseBody = await invokeWithRetry({
    modelId: MODEL_ID,
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  return parseJson<import("./types.js").NodeChatAction>(extractContent(responseBody));
}
