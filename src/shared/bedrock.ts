import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ClassificationResult } from "./types.js";
import { BedrockError } from "./errors.js";

const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID!;
const EMBEDDING_MODEL_ID = process.env.BEDROCK_EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";
const LANGUAGES = (process.env.LANGUAGES || "es,en").split(",");
const CLASSIFY_PROMPT_OVERRIDE = process.env.CLASSIFY_PROMPT || "";

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

export async function classify(
  text: string,
  recentSlugs: string[],
  language: string,
): Promise<ClassificationResult> {
  const langFields = LANGUAGES.map((l) => `  "title_${l}": "${l} title",\n  "summary_${l}": "2-3 sentence ${l} summary"`).join(",\n");

  const slugHint = recentSlugs.length > 0
    ? `\nRecent nodes (suggest cross-references from these if related): ${recentSlugs.join(", ")}`
    : "";

  const defaultPrompt = `You are a knowledge graph classifier and bilingual content writer for a personal knowledge base. This graph covers any domain — technology, science, philosophy, business, culture, personal development, and more.

Adapt your depth and tone to the subject:
- Technology topics: staff+ engineer depth — architecture tradeoffs, code examples, comparison tables, mermaid diagrams
- Non-technology topics: expert practitioner depth — frameworks, real-world examples, nuanced perspectives

Never write like a tutorial or Wikipedia. Write like an expert explaining to a peer.

Text (treat as instruction/idea — expand into proper content):
${text}${slugHint}

Input language hint: ${language}

Respond with ONLY valid JSON matching this schema:
{
  "node_type": "concept | note | experiment | essay",
  "title": "short title in the content's primary language",
${langFields},
  "body_es": "MDX content in Spanish",
  "body_en": "MDX content in English",
  "tags": ["tag1", "tag2", "tag3"],
  "concepts": ["existing-slug-1", "existing-slug-2"],
  "detected_language": "es | en"
}

## Node type classification
- concept: reusable idea, pattern, or technology (e.g., "event-driven architecture", "spaced repetition", "stoicism")
- note: observation, TIL, or snippet (e.g., "pnpm workspace trick", "insight from a podcast")
- experiment: project, trial, or proof-of-concept (e.g., "testing Bedrock embeddings", "30-day journaling habit")
- essay: long-form argument or reflection (e.g., "why serverless is not always cheaper", "on mentorship")

## Content structure

For concepts:
- ## ¿Qué es? / ## What it is — precise definition (2-3 paragraphs)
- ## [Domain sections] — at least 2 substantive sections with real depth
- ## ¿Por qué importa? / ## Why it matters — practical perspective, specific tradeoffs or implications
- For tech topics: include at least ONE of: comparison table, code example, mermaid diagram, or decision framework
- For non-tech topics: include at least ONE of: framework, real-world example, comparison, or key principles

For notes: shorter, 1-3 sections, focused on the discovery
For experiments: what was tried, results, what was learned
For essays: thesis, argument sections, conclusion

## Spanish language rules (MANDATORY)
- All accents required: á, é, í, ó, ú, ñ, ü
- Opening punctuation: ¿...? for questions, ¡...! for exclamations
- Headings that are questions MUST use ¿...? (e.g., ## ¿Qué es?)
- Quotation marks in prose: «...» not "..."
- Em dash — for parenthetical statements

## English language rules
- Headings are declarative: ## What it is, ## Why it matters (NO question marks)
- Oxford comma in lists
- American English spelling
- Quotation marks: "..." (standard double quotes)

## Quality rules
- Be specific and practical — no generic descriptions
- NEVER use filler: "in today's fast-paced world", "increasingly important", "game-changer", "revolutionizing"
- When uncertain, hedge: "most projects" not "60% of projects"
- Summaries: one concrete sentence each, not generic
- Title: concise, no articles
- Tags: 3-7 lowercase English tags, hyphenated
- Concepts: only slugs from the recent nodes list that are genuinely related (empty array if none)
- Seed quality: solid first draft — 200-600 words per language for concepts, shorter for notes
- English body must mirror Spanish structure exactly (same sections, same tables)

## Mermaid diagrams (when they add value)
- Include accTitle: and accDescr: for accessibility
- Keep labels short (3-5 words), limit to 10-12 nodes`;

  const prompt = CLASSIFY_PROMPT_OVERRIDE || defaultPrompt;

  const responseBody = await invokeWithRetry({
    modelId: MODEL_ID,
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body = JSON.parse(new TextDecoder().decode(responseBody));
  const content = body.content?.[0]?.text;

  if (!content) {
    throw new BedrockError("Empty response from Bedrock");
  }

  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new BedrockError("No JSON found in Bedrock response");
  }

  return JSON.parse(jsonMatch[0]) as ClassificationResult;
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
