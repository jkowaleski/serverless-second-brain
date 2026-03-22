import { putNode, putAudit } from "../../../shared/dynamodb.js";
import { putBody } from "../../../shared/s3.js";
import type { CaptureRequest, ClassificationResult, MetaItem, AuditItem } from "../../../shared/types.js";

interface PersistInput {
  input: CaptureRequest;
  metadata: ClassificationResult;
  slug: string;
}

interface PersistOutput extends PersistInput {
  now: string;
}

export const handler = async (event: PersistInput): Promise<PersistOutput> => {
  const { input, metadata, slug } = event;
  const now = new Date().toISOString();
  const nodeType = input.type ?? "concept";
  const actor = input.actor ?? "human";

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
    word_count_es: input.language === "es" ? input.text.split(/\s+/).length : 0,
    word_count_en: input.language === "en" ? input.text.split(/\s+/).length : 0,
  };

  await putNode(meta);
  await putBody(nodeType, slug, input.text, input.language ?? "es");

  const audit: AuditItem = {
    PK: `AUDIT#${now}`,
    SK: `NODE#${slug}`,
    action: "create",
    actor,
    changes: { node_type: nodeType, status: "seed" },
    ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
  };
  await putAudit(audit);

  return { ...event, now };
};
