import { putEdge } from "../../../shared/dynamodb.js";
import type { CaptureRequest, ClassificationResult, EdgeItem, CaptureResponse } from "../../../shared/types.js";

interface EdgesInput {
  input: CaptureRequest;
  metadata: ClassificationResult;
  slug: string;
  now: string;
}

export const handler = async (event: EdgesInput): Promise<CaptureResponse> => {
  const { input, metadata, slug, now } = event;
  const actor = input.actor ?? "human";

  for (const target of metadata.concepts) {
    const fwd: EdgeItem = {
      PK: `NODE#${slug}`,
      SK: `EDGE#${target}`,
      edge_type: "related",
      weight: 1.0,
      created_at: now,
      created_by: actor,
    };
    const rev: EdgeItem = {
      PK: `NODE#${target}`,
      SK: `EDGE#${slug}`,
      edge_type: "related",
      weight: 1.0,
      created_at: now,
      created_by: actor,
    };
    await Promise.all([putEdge(fwd), putEdge(rev)]);
  }

  return {
    id: slug,
    slug,
    node_type: input.type ?? "concept",
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
};
