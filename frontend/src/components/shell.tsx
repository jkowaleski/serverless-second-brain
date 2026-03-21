"use client";

import Link from "next/link";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { PrefsMenu } from "@/components/prefs-menu";
import { t, type DictKey } from "@/lib/i18n";
import { Separator } from "@/components/ui/separator";

const NAV_KEYS: { href: string; key: DictKey }[] = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/graph", key: "nav.graph" },
  { href: "/search", key: "nav.search" },
  { href: "/concepts", key: "nav.concepts" },
  { href: "/timeline", key: "nav.timeline" },
];

function ShellInner({ children }: { children: React.ReactNode }) {
  const { layout, locale } = usePrefs();
  const maxW = layout === "boxed" ? "max-w-6xl" : "";

  return (
    <>
      <nav className="border-b border-border px-6 py-3">
        <div className={`mx-auto flex items-center justify-between ${maxW}`}>
          <Link href="/" className="text-lg font-semibold tracking-tight">ssb</Link>
          <div className="flex items-center gap-5">
            <div className="flex gap-4 text-sm text-muted-foreground">
              {NAV_KEYS.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-foreground transition-colors">
                  {t(n.key, locale)}
                </Link>
              ))}
            </div>
            <PrefsMenu />
          </div>
        </div>
      </nav>
      <main className={`mx-auto px-6 py-10 ${maxW}`}>{children}</main>
      <Separator />
      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        {t("footer", locale)}
      </footer>
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PrefsProvider>
      <ShellInner>{children}</ShellInner>
    </PrefsProvider>
  );
}
