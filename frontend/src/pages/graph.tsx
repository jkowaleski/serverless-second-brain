import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";
import { ForceGraph } from "@/components/force-graph";
import { Filters } from "@/components/filters";
import { t } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";

export default function Graph() {
  const { locale } = usePrefs();
  const { token, loading: authLoading } = useAuth();
  const [data, setData] = useState<GraphResponse | null>(null);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (authLoading) return;
    api.graph({ type: type || undefined, status: status || undefined }, token).then(setData).catch(() => {});
  }, [type, status, token, authLoading]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("graph.title", locale)}</h1>
        {data && <p className="mt-1 text-sm text-[var(--color-muted)]">{data.meta.node_count} {t("graph.nodes", locale)}, {data.meta.edge_count} {t("graph.edges", locale)}</p>}
      </div>

      <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />

      {data ? <ForceGraph nodes={data.nodes} edges={data.edges} /> : <div className="h-[60vh] animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]" />}
    </div>
  );
}
