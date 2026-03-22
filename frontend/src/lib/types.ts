export interface GraphNode {
  id: string;
  title: string;
  node_type: "concept" | "note" | "experiment" | "essay";
  status: "seed" | "growing" | "evergreen";
  tags: string[];
  edge_count: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  edge_type: string;
  weight: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: { node_count: number; edge_count: number; generated_at: string };
}

export interface SearchResult {
  id: string;
  title: string;
  title_es: string;
  title_en: string;
  summary_es: string;
  summary_en: string;
  node_type: string;
  status: string;
  tags: string[];
  score: number;
  score_keyword: number;
  score_semantic: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  took_ms: number;
}

export interface NodeDetail {
  id: string;
  title: string;
  title_es: string;
  title_en: string;
  summary_es: string;
  summary_en: string;
  node_type: string;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  word_count_es?: number;
  word_count_en?: number;
}

export interface NodeEdge {
  target: string;
  edge_type: string;
  weight: number;
}

export interface RelatedNode {
  id: string;
  title: string;
  node_type: string;
  status: string;
}

export interface NodeResponse {
  node: NodeDetail;
  edges: NodeEdge[];
  related: RelatedNode[];
  body?: string;
}
