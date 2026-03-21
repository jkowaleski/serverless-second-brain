import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ClassificationResult } from "./types.js";
import { BedrockError } from "./errors.js";

const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID!;
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

export async function classify(
  text: string,
  existingSlugs: string[],
  language: "es" | "en",
): Promise<ClassificationResult> {
  const prompt = `You are a knowledge graph classifier. Given the following text, generate structured metadata for a knowledge node.

Text:
${text}

Existing nodes in the graph (suggest cross-references from these): ${existingSlugs.slice(0, 50).join(", ")}

Input language: ${language}

Respond with ONLY valid JSON matching this schema:
{
  "title": "short title in the content's primary language",
  "title_es": "Spanish title",
  "title_en": "English title",
  "summary_es": "2-3 sentence Spanish summary",
  "summary_en": "2-3 sentence English summary",
  "tags": ["tag1", "tag2", "tag3"],
  "concepts": ["existing-slug-1", "existing-slug-2"]
}

Rules:
- tags: 3-7 lowercase hyphenated tags
- concepts: only slugs from the existing nodes list that are genuinely related
- summaries: concrete and specific, not generic
- title: concise, no articles`;

  const responseBody = await invokeWithRetry({
    modelId: MODEL_ID,
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
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
