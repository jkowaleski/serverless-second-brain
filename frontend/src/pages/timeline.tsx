import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import type { GraphNode } from "@/lib/types";
import { NodeCard } from "@/components/node-card";
import { CardListSkeleton } from "@/components/skeletons";
import { Filters } from "@/components/filters";
import { t, localized, typeLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

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
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");

  useEffect(() => {
    setLoading(true);
    api.graph().then((d) => { setNodes(d.nodes); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = nodes.filter((n) => n.updated_at);
    if (type) list = list.filter((n) => n.node_type === type);
    return list.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }, [nodes, type]);

  const months = useMemo(() => groupByMonth(filtered, locale), [filtered, locale]);

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
            <section key={month.key} className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">{month.label}</h2>
                <CountPills counts={month.counts} locale={locale} />
              </div>
              {month.days.map((day) => (
                <div key={day.key} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[var(--color-muted)]">{day.label}</span>
                    <CountPills counts={day.counts} locale={locale} />
                  </div>
                  <ul className="space-y-2">
                    {day.items.map((n) => (
                      <li key={n.id}>
                        <NodeCard id={n.id} title={localized(n, "title", locale)} summary={localized(n, "summary", locale) || undefined} node_type={n.node_type} status={n.status} tags={n.tags} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
