"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";
import { ForceGraph } from "@/components/force-graph";
import { Filters } from "@/components/filters";
import { TYPE_COLORS } from "@/lib/constants";
import { t, typeLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export default function GraphPage() {
  const { locale } = usePrefs();
  const [data, setData] = useState<GraphResponse | null>(null);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.graph({ type: type || undefined, status: status || undefined })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [type, status]);

  if (error) return <p className="text-destructive">{t("common.error", locale, { msg: error })}</p>;
  if (!data) return <p className="text-muted-foreground">{t("graph.loading", locale)}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("graph.title", locale)}</h1>
        <div className="flex items-center gap-4">
          <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />
          <span className="text-sm text-muted-foreground">
            {t("graph.nodes_edges", locale, { nodes: data.meta.node_count, edges: data.meta.edge_count })}
          </span>
        </div>
      </div>

      <ForceGraph nodes={data.nodes} edges={data.edges} />

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(TYPE_COLORS).map(([tp, c]) => (
          <span key={tp} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
            {typeLabel(tp, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}
