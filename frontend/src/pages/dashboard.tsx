import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, FileText, FlaskConical, PenLine } from "lucide-react";
import { api } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";
import { TYPE_COLORS } from "@/lib/constants";
import { StatusIcon, StatusBadge } from "@/components/badges";
import { DashboardSkeleton } from "@/components/skeletons";
import { t, localized, typeLabel, statusLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  concept: Brain, note: FileText, experiment: FlaskConical, essay: PenLine,
};

function TypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type];
  return Icon ? <Icon className="h-3 w-3 text-[var(--color-muted)]" /> : null;
}

const STATUS_COLORS: Record<string, string> = { seed: "#a87c4f", growing: "#84cc16", evergreen: "#16a34a" };
const STATUSES = ["seed", "growing", "evergreen"] as const;
const TYPES = ["concept", "note", "experiment", "essay"] as const;

export default function Dashboard() {
  const { locale } = usePrefs();
  const { token, loading: authLoading } = useAuth();
  const [data, setData] = useState<GraphResponse | null>(null);

  useEffect(() => { if (!authLoading) api.graph(undefined, token).then(setData).catch(() => {}); }, [token, authLoading]);

  if (!data) return <DashboardSkeleton />;

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const connections = new Map<string, number>();
  for (const n of data.nodes) {
    byType[n.node_type] = (byType[n.node_type] ?? 0) + 1;
    byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
  }
  for (const e of data.edges) {
    connections.set(e.source, (connections.get(e.source) ?? 0) + 1);
    connections.set(e.target, (connections.get(e.target) ?? 0) + 1);
  }
  const avgConnections = data.nodes.length > 0
    ? (data.nodes.reduce((sum, n) => sum + (connections.get(n.id) ?? 0), 0) / data.nodes.length).toFixed(1)
    : "0";
  const topConnected = [...data.nodes].sort((a, b) => b.edge_count - a.edge_count).slice(0, 10);
  const needsAttention = [...data.nodes].filter((n) => n.edge_count <= 2).sort((a, b) => a.edge_count - b.edge_count).slice(0, 15);
  const seeds = data.nodes.filter((n) => n.status === "seed");

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">{t("dashboard.title", locale)}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{data.meta.node_count} {t("dashboard.nodes", locale)}, {data.meta.edge_count} {t("dashboard.edges", locale)}</p>
      </div>

      {/* Overview grid — matching jonmatum.com */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TYPES.map((tp) => (
          <Link key={tp} to={`/${tp}s`} className="rounded-lg border border-[var(--color-border)] p-4 text-center transition-colors hover:border-[var(--color-muted)]">
            <div className="font-mono text-2xl font-semibold">{byType[tp] ?? 0}</div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">{typeLabel(tp, locale)}s</div>
          </Link>
        ))}
      </div>

      {/* Graph health + Status distribution */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">{t("dashboard.graph_health", locale)}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[var(--color-border)] p-3 text-center">
              <div className="font-mono text-lg font-semibold">{data.meta.node_count}</div>
              <div className="text-[10px] text-[var(--color-muted)]">{t("dashboard.nodes", locale)}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3 text-center">
              <div className="font-mono text-lg font-semibold">{data.meta.edge_count}</div>
              <div className="text-[10px] text-[var(--color-muted)]">{t("dashboard.edges", locale)}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3 text-center">
              <div className="font-mono text-lg font-semibold">{avgConnections}</div>
              <div className="text-[10px] text-[var(--color-muted)]">{t("dashboard.avg_connections", locale)}</div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">{t("dashboard.by_status", locale)}</h2>
          <div className="flex h-3 overflow-hidden rounded-full">
            {STATUSES.map((s) => (byStatus[s] ?? 0) > 0 && (
              <div key={s} style={{ width: `${((byStatus[s] ?? 0) / data.nodes.length) * 100}%`, background: STATUS_COLORS[s] }} />
            ))}
          </div>
          <div className="flex gap-4 text-xs text-[var(--color-muted)]">
            {STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <StatusIcon status={s} className="h-3 w-3" />
                {statusLabel(s, locale)} ({byStatus[s] ?? 0})
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* Most connected */}
      <DashboardList locale={locale} title={t("dashboard.most_connected", locale)} items={topConnected.map((n) => ({
        id: n.id, title: n.title, type: n.node_type, status: n.status, right: String(n.edge_count),
      }))} />

      {/* Seeds to grow */}
      {seeds.length > 0 && (
        <DashboardList locale={locale} title={`${t("dashboard.seeds", locale)} (${seeds.length})`} items={seeds.map((n) => ({
          id: n.id, title: n.title, type: n.node_type, status: n.status,
        }))} />
      )}

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <DashboardList locale={locale} title={`${t("dashboard.needs_attention", locale)} (${needsAttention.length})`} items={needsAttention.map((n) => ({
          id: n.id, title: n.title, type: n.node_type, status: n.status,
          right: n.edge_count === 0 ? (locale === "es" ? "hu\u00e9rfano" : "orphan") : String(n.edge_count),
        }))} />
      )}
    </div>
  );
}

function DashboardList({ title, items, locale }: { title: string; locale: string; items: { id: string; title: string; type: string; status: string; right?: string }[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-[var(--color-muted)]">{title}</h2>
      <ul className="space-y-1">
        {items.map((n) => {
          return (
            <li key={n.id}>
              <Link to={`/node?id=${n.id}`} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--color-border)]">
                <span className="mt-0.5 shrink-0"><TypeIcon type={n.type} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{n.title}</span>
                    <StatusBadge status={n.status} />
                  </span>
                </span>
                {n.right && <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">{n.right}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
