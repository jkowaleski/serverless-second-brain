"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { TYPE_COLORS } from "@/lib/constants";
import { t, typeLabel, statusLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export default function DashboardPage() {
  const { locale } = usePrefs();
  const [data, setData] = useState<GraphResponse | null>(null);

  useEffect(() => { api.graph().then(setData); }, []);

  if (!data) return <p className="text-muted-foreground">{t("common.loading", locale)}</p>;

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of data.nodes) {
    byType[n.node_type] = (byType[n.node_type] ?? 0) + 1;
    byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
  }
  const orphans = data.nodes.filter((n) => n.edge_count < 2).length;
  const topConnected = [...data.nodes].sort((a, b) => b.edge_count - a.edge_count).slice(0, 10);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("dashboard.title", locale)}</h1>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("dashboard.nodes", locale)} value={data.meta.node_count} />
        <StatCard label={t("dashboard.edges", locale)} value={data.meta.edge_count} />
        <StatCard label={t("dashboard.orphans", locale)} value={orphans} sub={t("dashboard.orphans.sub", locale)} />
        <StatCard label={t("dashboard.seeds", locale)} value={byStatus["seed"] ?? 0} sub={t("dashboard.seeds.sub", locale)} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">{t("dashboard.by_type", locale)}</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {Object.entries(byType).map(([tp, count]) => (
            <Link key={tp} href={`/${tp}s`}>
              <Card className="transition hover:border-border/80">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[tp] }} />
                    <span className="text-sm font-medium">{typeLabel(tp, locale)}</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold">{count}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">{t("dashboard.by_status", locale)}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(byStatus).map(([st, count]) => (
            <Card key={st}>
              <CardContent className="p-4">
                <span className="text-sm">{statusLabel(st, locale)}</span>
                <p className="mt-1 text-2xl font-bold">{count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">{t("dashboard.most_connected", locale)}</h2>
        <div className="space-y-1">
          {topConnected.map((n) => (
            <Link
              key={n.id}
              href={`/node?id=${n.id}`}
              className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <span>{n.title}</span>
              <span className="text-muted-foreground">{t("dashboard.edges_count", locale, { count: n.edge_count })}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
