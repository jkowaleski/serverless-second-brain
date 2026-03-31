import type { GraphResponse, SearchResponse, NodeResponse } from "./types";

const API = import.meta.env.VITE_API_URL ?? "";
const MAX_RETRIES = 2;
const RETRY_DELAY = 500;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on network errors (Failed to fetch), not HTTP errors
      if (lastError.message.match(/^[0-9]{3}\s/)) throw lastError;
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
    }
  }
  throw lastError!;
}

function get<T>(path: string, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return request<T>(`${API}${path}`, { headers });
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
  node: (slug: string, opts?: { include_body?: boolean }, token?: string | null) => {
    const q = new URLSearchParams();
    if (opts?.include_body) q.set("include_body", "true");
    const qs = q.toString();
    return get<NodeResponse>(`/nodes/${slug}${qs ? `?${qs}` : ""}`, token);
  },
  capture: async (body: { text: string; url?: string; type?: string; visibility?: string }, token: string) => {
    return request(`${API}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  },
  patchVisibility: async (slug: string, visibility: "public" | "private", token: string) => {
    return request(`${API}/capture`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ slug, visibility }),
    });
  },
  nodeChat: async (slug: string, message: string, token: string) => {
    return request<{ action: string; message: string; [key: string]: unknown }>(`${API}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ action: "chat", slug, message }),
    });
  },
};
