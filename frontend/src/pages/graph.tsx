import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";
import { ForceGraph } from "@/components/force-graph";
import { Filters } from "@/components/filters";
import { TYPE_COLORS } from "@/lib/constants";
import { t, typeLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export default function Graph() {
  const { locale } = usePrefs();
  const [data, setData] = useState<GraphResponse | null>(null);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.graph({ type: type || undefined, status: status || undefined }).then(setData).catch(() => {});
  }, [type, status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("graph.title", locale)}</h1>
        {data && <p className="mt-1 text-sm text-[var(--color-muted)]">{data.meta.node_count} {t("graph.nodes", locale)}, {data.meta.edge_count} {t("graph.edges", locale)}</p>}
      </div>

      {/* Type color legend — matching jonmatum.com */}
      <div className="flex gap-4 text-xs text-[var(--color-muted)]">
        {Object.entries(TYPE_COLORS).map(([tp, color]) => (
          <span key={tp} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {typeLabel(tp, locale)}
          </span>
        ))}
      </div>

      <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />

      {data ? <ForceGraph nodes={data.nodes} edges={data.edges} /> : <div className="h-[60vh] animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]" />}
    </div>
  );
}
