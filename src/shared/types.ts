// DynamoDB item types — matches dynamodb-schema.md exactly

export interface MetaItem {
  PK: string;        // NODE#{slug}
  SK: "META";
  GSI2PK: string;    // STATUS#{status}
  slug: string;
  node_type: string;
  status: "seed" | "growing" | "evergreen";
  visibility: "public" | "private";
  title: string;
  title_es: string;
  title_en: string;
  summary_es: string;
  summary_en: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
  word_count_es?: number;
  word_count_en?: number;
}

export interface EdgeItem {
  PK: string;        // NODE#{slug}
  SK: string;        // EDGE#{target}
  edge_type: string;
  weight: number;
  created_at: string;
  created_by: string;
}

export interface EmbedItem {
  PK: string;        // NODE#{slug}
  SK: "EMBED";
  model: string;
  dimensions: number;
  vector: number[];
  source_text: string;
  generated_at: string;
}

export interface AuditItem {
  PK: string;        // AUDIT#{timestamp}
  SK: string;        // NODE#{slug}
  action: "create" | "update" | "connect" | "flag" | "migrate";
  actor: string;
  changes: Record<string, unknown>;
  ttl: number;
}

// API types — matches api-spec.md

export interface CaptureRequest {
  text: string;
  url?: string;
  type?: string;
  language?: "es" | "en";
  visibility?: "public" | "private";
  actor?: string;
}

export interface CaptureResponse {
  id: string;
  slug: string;
  node_type: string;
  status: "seed";
  title: string;
  title_es: string;
  title_en: string;
  summary_es: string;
  summary_en: string;
  tags: string[];
  concepts: string[];
  created_at: string;
  updated_at: string;
}

// Bedrock classification output
export interface ClassificationResult {
  node_type?: string;
  detected_language?: string;
  title: string;
  title_es: string;
  title_en: string;
  summary_es: string;
  summary_en: string;
  body_es: string;
  body_en: string;
  tags: string[];
  concepts: string[];
}

export interface NodeChatAction {
  action: "update_body" | "update_meta" | "add_edge" | "set_visibility" | "set_status" | "delete" | "none";
  body_es?: string;
  body_en?: string;
  meta?: Partial<{ title: string; title_es: string; title_en: string; summary_es: string; summary_en: string; tags: string[] }>;
  edge?: { target: string; edge_type?: string };
  visibility?: "public" | "private";
  status?: "seed" | "growing" | "evergreen";
  message_es: string;
  message_en: string;
}
