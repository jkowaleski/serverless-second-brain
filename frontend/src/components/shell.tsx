import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, X, LogIn, LogOut, Sun, Moon, Maximize, Minimize } from "lucide-react";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { AuthProvider, useAuth } from "@/lib/auth";
import { t, type DictKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV_KEYS: { href: string; key: DictKey }[] = [
  { href: "/concepts", key: "nav.concepts" },
  { href: "/notes", key: "nav.notes" },
  { href: "/experiments", key: "nav.experiments" },
  { href: "/essays", key: "nav.essays" },
];

const TOOL_KEYS: { href: string; key: DictKey }[] = [
  { href: "/graph", key: "nav.graph" },
  { href: "/search", key: "nav.search" },
  { href: "/timeline", key: "nav.timeline" },
  { href: "/dashboard", key: "nav.dashboard" },
];

function AuthButton() {
  const { user, loading, login, logout } = useAuth();
  const { locale } = usePrefs();
  if (loading) return null;
  if (user) {
    return (
      <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" title={user.email}>
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">{t("auth.logout", locale)}</span>
      </button>
    );
  }
  return (
    <button onClick={login} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <LogIn className="h-4 w-4" />
      <span className="hidden sm:inline">{t("auth.login", locale)}</span>
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = usePrefs();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function LayoutToggle() {
  const { layout, setLayout } = usePrefs();
  return (
    <button
      onClick={() => setLayout(layout === "boxed" ? "full" : "boxed")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label={layout === "boxed" ? "Full width" : "Boxed"}
    >
      {layout === "boxed" ? <Maximize className="h-4 w-4" /> : <Minimize className="h-4 w-4" />}
    </button>
  );
}

function LocaleToggle() {
  const { locale, setLocale } = usePrefs();
  return (
    <button
      onClick={() => setLocale(locale === "es" ? "en" : "es")}
      className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {locale === "es" ? "EN" : "ES"}
    </button>
  );
}

function ShellInner() {
  const { layout, locale } = usePrefs();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const maxW = layout === "boxed" ? "max-w-5xl" : "";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-screen flex-col">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-6 ${maxW}`}>
          {/* Logo */}
          <Link to="/" className="text-base font-semibold tracking-tight shrink-0" onClick={() => setOpen(false)}>
            ssb
          </Link>

          {/* Desktop nav — content types */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_KEYS.map((n) => (
              <Link
                key={n.href}
                to={n.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive(n.href)
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(n.key, locale)}
              </Link>
            ))}
          </div>

          {/* Desktop right side — tools + capture + controls */}
          <div className="hidden items-center gap-1 md:flex">
            {TOOL_KEYS.map((n) => (
              <Link
                key={n.href}
                to={n.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive(n.href)
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(n.key, locale)}
              </Link>
            ))}
            <Link
              to="/capture"
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                isActive("/capture")
                  ? "text-foreground"
                  : "text-primary hover:text-primary/80",
              )}
            >
              + {t("nav.capture", locale)}
            </Link>
            <div className="ml-1 flex items-center border-l border-border/50 pl-2">
              <AuthButton />
              <ThemeToggle />
              <LayoutToggle />
              <LocaleToggle />
            </div>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-0.5 md:hidden">
            <AuthButton />
            <ThemeToggle />
            <LocaleToggle />
            <button
              onClick={() => setOpen(!open)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="border-t border-border/50 px-4 pb-4 pt-2 md:hidden">
            <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("home.browse", locale)}</p>
            {NAV_KEYS.map((n) => (
              <Link
                key={n.href}
                to={n.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-md px-3 py-2.5 text-sm transition-colors",
                  isActive(n.href)
                    ? "text-foreground font-medium bg-accent"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t(n.key, locale)}
              </Link>
            ))}
            <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("nav.tools", locale)}</p>
            {TOOL_KEYS.map((n) => (
              <Link
                key={n.href}
                to={n.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-md px-3 py-2.5 text-sm transition-colors",
                  isActive(n.href)
                    ? "text-foreground font-medium bg-accent"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t(n.key, locale)}
              </Link>
            ))}
            <div className="mt-3 border-t border-border/50 pt-3">
              <Link
                to="/capture"
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive("/capture")
                    ? "text-foreground bg-accent"
                    : "text-primary hover:bg-accent",
                )}
              >
                + {t("nav.capture", locale)}
              </Link>
              <div className="mt-2 flex items-center gap-1 px-3">
                <LayoutToggle />
                <span className="text-xs text-muted-foreground">{t(layout === "boxed" ? "prefs.boxed" : "prefs.full", locale)}</span>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-10 ${maxW}`}>
        <Outlet />
      </main>

      <footer className={`mx-auto w-full border-t border-border/50 px-4 py-6 sm:px-6 ${maxW}`}>
        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>{t("footer", locale)}</span>
          <span className="text-muted-foreground/60">alpha</span>
        </div>
      </footer>
    </div>
  );
}

export default function Shell() {
  return (
    <PrefsProvider>
      <AuthProvider>
        <ShellInner />
      </AuthProvider>
    </PrefsProvider>
  );
}
