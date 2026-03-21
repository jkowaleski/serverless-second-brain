"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { t, type DictKey } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

const CARDS: { href: string; titleKey: DictKey; descKey: DictKey }[] = [
  { href: "/dashboard", titleKey: "home.dashboard", descKey: "home.dashboard.desc" },
  { href: "/graph", titleKey: "home.graph", descKey: "home.graph.desc" },
  { href: "/search", titleKey: "home.search", descKey: "home.search.desc" },
  { href: "/concepts", titleKey: "home.concepts", descKey: "home.concepts.desc" },
  { href: "/notes", titleKey: "home.notes", descKey: "home.notes.desc" },
  { href: "/experiments", titleKey: "home.experiments", descKey: "home.experiments.desc" },
  { href: "/essays", titleKey: "home.essays", descKey: "home.essays.desc" },
  { href: "/timeline", titleKey: "home.timeline", descKey: "home.timeline.desc" },
];

export default function Home() {
  const { locale } = usePrefs();
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">{t("home.title", locale)}</h1>
        <p className="max-w-xl text-lg text-muted-foreground">{t("home.subtitle", locale)}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="h-full transition hover:border-border/80 hover:bg-accent/50">
              <CardContent className="p-5">
                <h2 className="font-semibold">{t(c.titleKey, locale)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t(c.descKey, locale)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
