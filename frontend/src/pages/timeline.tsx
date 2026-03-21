import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { GraphNode } from "@/lib/types";
import { StatusBadge } from "@/components/badges";
import { Filters } from "@/components/filters";
import { TYPE_COLORS } from "@/lib/constants";
import { t, localized } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export default function Timeline() {
  const { locale } = usePrefs();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => { api.graph().then((d) => setNodes(d.nodes)).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    let list = nodes;
    if (type) list = list.filter((n) => n.node_type === type);
    if (status) list = list.filter((n) => n.status === status);
    if (query.length >= 2) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((n) => terms.every((term) => n.title.toLowerCase().includes(term)));
    }
    return list.sort((a, b) => a.title.localeCompare(b.title, locale));
  }, [nodes, type, status, query, locale]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("timeline.title", locale)}</h1>
      </div>

      <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />

      {/* Search */}
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

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-[var(--color-muted)]">{t("listing.empty", locale)}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <li key={n.id}>
              <Link to={`/node?id=${n.id}`} className="flex overflow-hidden rounded-lg border border-[var(--color-border)] transition-colors hover:border-[var(--color-muted)]">
                <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: TYPE_COLORS[n.node_type] }} />
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    <StatusBadge status={n.status} />
                  </div>
                </div>
                <div className="flex items-center pr-3 text-xs text-[var(--color-muted)]">{n.edge_count}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
