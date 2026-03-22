import { useEffect, useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { GraphNode } from "@/lib/types";
import { NodeCard } from "@/components/node-card";
import { CardListSkeleton } from "@/components/skeletons";
import { Filters } from "@/components/filters";
import { t, localized } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export default function Timeline() {
  const { locale } = usePrefs();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    api.graph().then((d) => { setNodes(d.nodes); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = nodes;
    if (type) list = list.filter((n) => n.node_type === type);
    if (status) list = list.filter((n) => n.status === status);
    if (query.length >= 2) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((n) => {
        const haystack = `${localized(n, "title", locale)} ${localized(n, "summary", locale)} ${(n.tags ?? []).join(" ")}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
    }
    return list.sort((a, b) => localized(a, "title", locale).localeCompare(localized(b, "title", locale), locale));
  }, [nodes, type, status, query, locale]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("timeline.title", locale)}</h1>

      <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("listing.filter", locale)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-transparent py-2 pl-10 pr-9 text-sm outline-none focus:border-[var(--color-accent)]" />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-fg)]" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {(query.length >= 2 || type || status) && (
        <p className="text-xs text-[var(--color-muted)]">{filtered.length} / {nodes.length}</p>
      )}

      {loading ? (
        <CardListSkeleton />
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-[var(--color-muted)]">{t("listing.empty", locale)}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <li key={n.id}>
              <NodeCard id={n.id} title={localized(n, "title", locale)} summary={localized(n, "summary", locale) || undefined} node_type={n.node_type} status={n.status} tags={n.tags} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
