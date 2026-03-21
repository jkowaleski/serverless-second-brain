"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { SearchResponse } from "@/lib/types";
import { NodeCard } from "@/components/node-card";
import { Filters } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t, localized } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

const SUGGESTIONS = ["serverless", "lambda", "terraform", "knowledge graph", "bedrock", "mcp"];

export default function SearchPage() {
  const { locale } = usePrefs();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      setError("");
      try {
        setData(await api.search(q, { type: type || undefined, status: status || undefined, limit: 20 }));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [type, status],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("search.title", locale)}</h1>

      <form onSubmit={(e) => { e.preventDefault(); search(query); }} className="flex gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder", locale)}
          aria-label={t("search.title", locale)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "\u2026" : t("search.button", locale)}
        </Button>
      </form>

      <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />

      {error && <p className="text-destructive">{error}</p>}

      {data && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("search.results", locale, { count: data.total, s: data.total !== 1 ? "s" : "", ms: data.took_ms })}
          </p>
          {data.results.map((r) => (
            <NodeCard
              key={r.id}
              id={r.id}
              title={r.title}
              summary={localized(r, "summary", locale)}
              node_type={r.node_type}
              status={r.status}
              tags={r.tags}
              score={r.score}
            />
          ))}
          {data.total === 0 && (
            <p className="text-muted-foreground">{t("search.no_results", locale, { q: data.query })}</p>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("search.suggestions", locale)}</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => { setQuery(s); search(s); }}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
