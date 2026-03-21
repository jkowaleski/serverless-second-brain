import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { SearchResponse } from "@/lib/types";
import { NodeCard } from "@/components/node-card";
import { Filters } from "@/components/filters";
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

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setData(null); return; }
    setLoading(true); setError("");
    try {
      setData(await api.search(q, { type: type || undefined, status: status || undefined, limit: 20 }));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }, [type, status]);

  // Debounced search on query change
  useEffect(() => {
    if (query.trim().length < 2) { setData(null); return; }
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("search.title", locale)}</h1>

      <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />

      {/* Search input with clear button */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search.placeholder", locale)} aria-label={t("search.title", locale)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-transparent py-2 pl-10 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-accent)]" />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-fg)]" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {data ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-muted)]">{t("search.results", locale, { count: data.total, s: data.total !== 1 ? "s" : "", ms: data.took_ms })}</p>
          {data.results.map((r) => (
            <NodeCard key={r.id} id={r.id} title={r.title} summary={localized(r, "summary", locale)} node_type={r.node_type} status={r.status} tags={r.tags} score={r.score} />
          ))}
          {data.total === 0 && (
            <p className="text-sm text-[var(--color-muted)]">{t("search.no_results", locale, { q: data.query })}</p>
          )}
        </div>
      ) : !loading ? (
        <div className="space-y-2 pt-2">
          <p className="text-xs text-[var(--color-muted)]">{t("search.suggestions", locale)}</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setQuery(s)}
                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
