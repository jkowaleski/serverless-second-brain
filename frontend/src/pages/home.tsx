import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { t, type DictKey } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { BarChart3, GitFork, Search, BookOpen, FileText, FlaskConical, PenLine, Clock, PlusCircle } from "lucide-react";

const EXPLORE: { href: string; titleKey: DictKey; descKey: DictKey; icon: React.ReactNode }[] = [
  { href: "/graph", titleKey: "home.graph", descKey: "home.graph.desc", icon: <GitFork className="h-5 w-5 text-muted-foreground" /> },
  { href: "/search", titleKey: "home.search", descKey: "home.search.desc", icon: <Search className="h-5 w-5 text-muted-foreground" /> },
  { href: "/timeline", titleKey: "home.timeline", descKey: "home.timeline.desc", icon: <Clock className="h-5 w-5 text-muted-foreground" /> },
  { href: "/dashboard", titleKey: "home.dashboard", descKey: "home.dashboard.desc", icon: <BarChart3 className="h-5 w-5 text-muted-foreground" /> },
];

const BROWSE: { href: string; titleKey: DictKey; descKey: DictKey; icon: React.ReactNode; color: string }[] = [
  { href: "/concepts", titleKey: "home.concepts", descKey: "home.concepts.desc", icon: <BookOpen className="h-5 w-5" />, color: "text-indigo-500" },
  { href: "/notes", titleKey: "home.notes", descKey: "home.notes.desc", icon: <FileText className="h-5 w-5" />, color: "text-cyan-500" },
  { href: "/experiments", titleKey: "home.experiments", descKey: "home.experiments.desc", icon: <FlaskConical className="h-5 w-5" />, color: "text-amber-500" },
  { href: "/essays", titleKey: "home.essays", descKey: "home.essays.desc", icon: <PenLine className="h-5 w-5" />, color: "text-pink-500" },
];

export default function Home() {
  const { locale } = usePrefs();
  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="space-y-3 pt-4 sm:pt-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("home.title", locale)}</h1>
        <p className="max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg">{t("home.subtitle", locale)}</p>
      </div>

      {/* Browse by type — primary action */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {BROWSE.map((c) => (
          <Link key={c.href} to={c.href}>
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={c.color}>{c.icon}</div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{t(c.titleKey, locale)}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(c.descKey, locale)}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Explore tools */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("home.explore", locale)}</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {EXPLORE.map((c) => (
            <Link key={c.href} to={c.href}>
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 shrink-0">{c.icon}</div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{t(c.titleKey, locale)}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{t(c.descKey, locale)}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Capture CTA */}
      <Link to="/capture">
        <Card className="transition-colors hover:bg-accent/50 border-dashed">
          <CardContent className="flex items-center gap-3 p-4">
            <PlusCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <h2 className="text-sm font-semibold">{t("home.capture", locale)}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("home.capture.desc", locale)}</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
