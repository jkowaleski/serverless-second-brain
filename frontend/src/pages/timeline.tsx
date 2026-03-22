import { useEffect, useState, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { GraphNode } from "@/lib/types";
import { NodeCard } from "@/components/node-card";
import { CardListSkeleton } from "@/components/skeletons";
import { Filters } from "@/components/filters";
import { t, localized, typeLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";

type DayGroup = { key: string; label: string; counts: Record<string, number>; items: GraphNode[] };
type MonthGroup = { key: string; label: string; counts: Record<string, number>; days: DayGroup[] };

function groupByMonth(nodes: GraphNode[], locale: "es" | "en"): MonthGroup[] {
  const dayMap = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const d = n.updated_at?.slice(0, 10) ?? "1970-01-01";
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(n);
  }

  const sortedDays = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const monthMap = new Map<string, DayGroup[]>();
  for (const [dateStr, items] of sortedDays) {
    const monthKey = dateStr.slice(0, 7);
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);
    const date = new Date(dateStr + "T12:00:00Z");
    const dayLabel = date.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    const counts: Record<string, number> = {};
    for (const n of items) counts[n.node_type] = (counts[n.node_type] ?? 0) + 1;
    monthMap.get(monthKey)!.push({ key: dateStr, label: dayLabel, counts, items });
  }

  return [...monthMap.entries()].map(([monthKey, days]) => {
    const date = new Date(monthKey + "-15T12:00:00Z");
    const label = date.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
    const counts: Record<string, number> = {};
    for (const d of days) for (const [k, v] of Object.entries(d.counts)) counts[k] = (counts[k] ?? 0) + v;
    return { key: monthKey, label, counts, days };
  });
}

function CountPills({ counts, locale }: { counts: Record<string, number>; locale: "es" | "en" }) {
  const types = ["concept", "note", "experiment", "essay"];
  const pills = types.filter((t) => counts[t]);
  if (!pills.length) return null;
  return (
    <span className="text-xs text-[var(--color-muted)]">
      {pills.map((tp, i) => (
        <span key={tp}>{i > 0 && " · "}{counts[tp]} {typeLabel(tp, locale)}{counts[tp] > 1 ? "s" : ""}</span>
      ))}
    </span>
  );
}

export default function Timeline() {
  const { locale } = usePrefs();
  const { token, loading: authLoading } = useAuth();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    api.graph(undefined, token).then((d) => { setNodes(d.nodes); setLoading(false); }).catch(() => setLoading(false));
  }, [token, authLoading]);

  const filtered = useMemo(() => {
    let list = nodes.filter((n) => n.updated_at);
    if (type) list = list.filter((n) => n.node_type === type);
    return list.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }, [nodes, type]);

  const months = useMemo(() => groupByMonth(filtered, locale), [filtered, locale]);

  // Default: first day of each month open
  useEffect(() => {
    const keys = new Set<string>();
    for (const m of months) if (m.days[0]) keys.add(m.days[0].key);
    setOpen(keys);
  }, [months]);

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("timeline.title", locale)}</h1>
        {!loading && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {t("timeline.description", locale, { count: filtered.length })}
          </p>
        )}
      </div>

      <Filters type={type} status="" onTypeChange={setType} onStatusChange={() => {}} />

      {loading ? (
        <CardListSkeleton />
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-[var(--color-muted)]">{t("listing.empty", locale)}</p>
      ) : (
        <div className="space-y-10">
          {months.map((month) => (
            <section key={month.key} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{month.label}</h2>
                <CountPills counts={month.counts} locale={locale} />
              </div>
              {month.days.map((day) => (
                <div key={day.key}>
                  <button onClick={() => toggle(day.key)} className="flex w-full items-center gap-2 py-1 text-left">
                    {open.has(day.key)
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />}
                    <span className="text-sm font-medium text-[var(--color-muted)]">{day.label}</span>
                    <CountPills counts={day.counts} locale={locale} />
                  </button>
                  {open.has(day.key) && (
                    <ul className="mt-2 space-y-2">
                      {day.items.map((n) => (
                        <li key={n.id}>
                          <NodeCard id={n.id} title={localized(n, "title", locale)} summary={localized(n, "summary", locale) || undefined} node_type={n.node_type} status={n.status} tags={n.tags} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
