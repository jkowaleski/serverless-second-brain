import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, FileText, FlaskConical, PenLine, Network, Search, Clock, BarChart3, PlusCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";
import { t, type DictKey } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";

const sections: { href: string; titleKey: DictKey; descKey: DictKey; icon: React.ReactNode; type: string }[] = [
  { href: "/concepts", titleKey: "home.concepts", descKey: "home.concepts.desc", icon: <Brain className="h-4 w-4" />, type: "concept" },
  { href: "/notes", titleKey: "home.notes", descKey: "home.notes.desc", icon: <FileText className="h-4 w-4" />, type: "note" },
  { href: "/experiments", titleKey: "home.experiments", descKey: "home.experiments.desc", icon: <FlaskConical className="h-4 w-4" />, type: "experiment" },
  { href: "/essays", titleKey: "home.essays", descKey: "home.essays.desc", icon: <PenLine className="h-4 w-4" />, type: "essay" },
];

const quickLinks: { href: string; key: DictKey; icon: React.ReactNode }[] = [
  { href: "/graph", key: "home.graph.full", icon: <Network className="h-3.5 w-3.5" /> },
  { href: "/search", key: "home.search.full", icon: <Search className="h-3.5 w-3.5" /> },
  { href: "/timeline", key: "home.timeline.full", icon: <Clock className="h-3.5 w-3.5" /> },
  { href: "/dashboard", key: "home.dashboard.full", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { href: "/capture", key: "home.capture.full", icon: <PlusCircle className="h-3.5 w-3.5" /> },
];

export default function Home() {
  const { locale } = usePrefs();
  const { token, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (authLoading) return;
    api.graph(undefined, token).then((d: GraphResponse) => {
      const c: Record<string, number> = {};
      for (const n of d.nodes) c[n.node_type] = (c[n.node_type] ?? 0) + 1;
      setCounts(c);
    }).catch(() => {});
  }, [token, authLoading]);

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative flex flex-col items-center gap-6 pt-8 text-center">
        <div className="pointer-events-none absolute -top-20 h-64 w-64 rounded-full bg-[var(--color-accent)] opacity-[0.07] blur-3xl" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("home.title", locale)}</h1>
          <p className="mt-2 text-[var(--color-muted)]">{t("home.subtitle", locale)}</p>
          <p className="mt-1 font-mono text-xs italic text-[var(--color-muted)]">{t("home.tagline", locale)}</p>
        </div>
      </section>

      {/* Section cards */}
      <section className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            to={s.href}
            className="group rounded-xl border border-[var(--color-border)] p-5 transition-all hover:border-[var(--color-accent)] hover:shadow-[0_0_20px_-5px_var(--color-accent)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-[var(--color-muted)] transition-colors group-hover:text-[var(--color-accent)]">{s.icon}</span>
                <h2 className="font-medium">{t(s.titleKey, locale)}</h2>
              </div>
              {counts[s.type] != null && (
                <span className="font-mono text-xs text-[var(--color-muted)]">{counts[s.type]}</span>
              )}
            </div>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{t(s.descKey, locale)}</p>
          </Link>
        ))}
      </section>

      {/* Quick links */}
      <section className="flex flex-wrap justify-center gap-3 text-xs text-[var(--color-muted)]">
        {quickLinks.map((l) => (
          <Link
            key={l.href}
            to={l.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 transition-colors hover:border-[var(--color-muted)]"
          >
            {l.icon} {t(l.key, locale)}
          </Link>
        ))}
      </section>
    </div>
  );
}
