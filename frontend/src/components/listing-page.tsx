"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GraphNode } from "@/lib/types";
import { NodeCard } from "@/components/node-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t, typeLabel, statusLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

const STATUSES = ["seed", "growing", "evergreen"];

export function ListingPage({ nodeType }: { nodeType: string }) {
  const { locale } = usePrefs();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"edges" | "title">("edges");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.graph({ type: nodeType, status: status || undefined }).then((d) => {
      setNodes(d.nodes);
      setLoading(false);
    });
  }, [nodeType, status]);

  const sorted = [...nodes].sort((a, b) =>
    sort === "edges" ? b.edge_count - a.edge_count : a.title.localeCompare(b.title),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{typeLabel(nodeType, locale)}s</h1>
        <div className="flex items-center gap-3">
          <Select value={status || "_all"} onValueChange={(v: string | null) => setStatus(!v || v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[140px]" aria-label={t("filter.status", locale)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{t("filter.all_statuses", locale)}</SelectItem>
              {STATUSES.map((st) => (
                <SelectItem key={st} value={st}>{statusLabel(st, locale)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v: string | null) => v && setSort(v as "edges" | "title")}>
            <SelectTrigger className="w-[160px]" aria-label={t("listing.sort", locale)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="edges">{t("listing.sort.edges", locale)}</SelectItem>
              <SelectItem value="title">{t("listing.sort.alpha", locale)}</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{sorted.length}</span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading", locale)}</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => (
            <NodeCard
              key={n.id}
              id={n.id}
              title={n.title}
              node_type={n.node_type}
              status={n.status}
              tags={n.tags}
              extra={<span className="ml-auto text-xs text-muted-foreground">{t("dashboard.edges_count", locale, { count: n.edge_count })}</span>}
            />
          ))}
        </div>
      )}
    </div>
  );
}
