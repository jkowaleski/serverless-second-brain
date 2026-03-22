import { useEffect, useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { GraphNode } from "@/lib/types";
import { NodeCard } from "@/components/node-card";
import { CardListSkeleton } from "@/components/skeletons";
import { StatusIcon } from "@/components/badges";
import { t, localized, typeLabel, statusLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";

const STATUSES = ["seed", "growing", "evergreen"];

export function ListingPage({ nodeType }: { nodeType: string }) {
  const { locale } = usePrefs();
  const { token, loading: authLoading } = useAuth();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    api.graph({ type: nodeType }, token).then((d) => {
      setNodes(d.nodes);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [nodeType, token, authLoading]);

  const filtered = useMemo(() => {
    let list = nodes;
    if (status) list = list.filter((n) => n.status === status);
    if (query.length >= 2) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((n) => {
        const haystack = `${localized(n, "title", locale)} ${localized(n, "summary", locale)} ${(n.tags ?? []).join(" ")}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
    }
    return list.sort((a, b) => localized(a, "title", locale).localeCompare(localized(b, "title", locale), locale));
  }, [nodes, status, query, locale]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{typeLabel(nodeType, locale)}s</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{t(`home.${nodeType}s.desc` as Parameters<typeof t>[0], locale)}</p>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted)]">{t("filter.status", locale)}</span>
        {STATUSES.map((st) => (
          <button key={st} onClick={() => setStatus(status === st ? "" : st)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              !status || status === st
                ? "border-[var(--color-border)] text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-muted)] opacity-40"
            }`}>
            <StatusIcon status={st} className="h-3 w-3" />
            {statusLabel(st, locale)}
          </button>
        ))}
      </div>

      {/* Search input */}
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

      {(query.length >= 2 || status) && (
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
