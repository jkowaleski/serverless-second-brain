import type { GraphResponse, SearchResponse, NodeResponse } from "./types";

const API = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  graph: (params?: { type?: string; status?: string }, token?: string | null) => {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return get<GraphResponse>(`/graph${qs ? `?${qs}` : ""}`, token);
  },
  search: (query: string, params?: { limit?: number; type?: string; status?: string }, token?: string | null) => {
    const q = new URLSearchParams({ q: query });
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.type) q.set("type", params.type);
    if (params?.status) q.set("status", params.status);
    return get<SearchResponse>(`/search?${q}`, token);
  },
  node: (slug: string, opts?: { include_body?: boolean; language?: string }, token?: string | null) => {
    const q = new URLSearchParams();
    if (opts?.include_body) q.set("include_body", "true");
    if (opts?.language) q.set("language", opts.language);
    const qs = q.toString();
    return get<NodeResponse>(`/nodes/${slug}${qs ? `?${qs}` : ""}`, token);
  },
  capture: async (body: { text: string; url?: string; type: string; language: string }, token: string) => {
    const res = await fetch(`${API}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};
