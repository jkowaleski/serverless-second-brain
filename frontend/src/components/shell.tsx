import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, X, LogIn, LogOut, Sun, Moon, Network, Clock, BarChart3 } from "lucide-react";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { AuthProvider, useAuth } from "@/lib/auth";
import { t, type DictKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const contentLinks: { href: string; key: DictKey }[] = [
  { href: "/concepts", key: "nav.concepts" },
  { href: "/notes", key: "nav.notes" },
  { href: "/experiments", key: "nav.experiments" },
  { href: "/essays", key: "nav.essays" },
];

const toolLinks: { href: string; key: DictKey; icon: React.ReactNode }[] = [
  { href: "/graph", key: "nav.graph", icon: <Network className="h-4 w-4" /> },
  { href: "/timeline", key: "nav.timeline", icon: <Clock className="h-4 w-4" /> },
  { href: "/dashboard", key: "nav.dashboard", icon: <BarChart3 className="h-4 w-4" /> },
];

const allMobileLinks: { href: string; key: DictKey }[] = [
  ...contentLinks,
  { href: "/graph", key: "nav.graph" },
  { href: "/search", key: "nav.search" },
  { href: "/timeline", key: "nav.timeline" },
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/capture", key: "nav.capture" },
];

function AuthButton() {
  const { user, loading, login, logout } = useAuth();
  const { locale } = usePrefs();
  if (loading) return null;
  if (user) {
    return (
      <button onClick={logout} className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]" title={user.email}>
        <LogOut className="h-4 w-4" />
        <span className="sr-only">{t("auth.logout", locale)}</span>
      </button>
    );
  }
  return (
    <button onClick={login} className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]">
      <LogIn className="h-4 w-4" />
      <span className="sr-only">{t("auth.login", locale)}</span>
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = usePrefs();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
      aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function LocaleToggle() {
  const { locale, setLocale } = usePrefs();
  return (
    <button
      onClick={() => setLocale(locale === "es" ? "en" : "es")}
      className="text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
    >
      {locale === "es" ? "EN" : "ES"}
    </button>
  );
}

function ShellInner() {
  const { locale } = usePrefs();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--color-border)]">
        <nav className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <Link to="/" className="font-mono text-sm font-semibold" onClick={() => setOpen(false)}>
                ssb
              </Link>
            </div>

            {/* Desktop nav */}
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-4 text-sm text-[var(--color-muted)] md:flex">
                {contentLinks.map((n) => (
                  <Link
                    key={n.href}
                    to={n.href}
                    className={cn(
                      "transition-colors hover:text-[var(--color-fg)]",
                      isActive(n.href) && "text-[var(--color-fg)] font-medium",
                    )}
                  >
                    {t(n.key, locale)}
                  </Link>
                ))}
                <span className="h-4 w-px bg-[var(--color-border)]" />
                {toolLinks.map((n) => (
                  <Link
                    key={n.href}
                    to={n.href}
                    className={cn(
                      "transition-colors hover:text-[var(--color-fg)]",
                      isActive(n.href) && "text-[var(--color-fg)]",
                    )}
                    aria-label={t(n.key, locale)}
                    title={t(n.key, locale)}
                  >
                    {n.icon}
                  </Link>
                ))}
              </div>

              {/* Controls */}
              <div className="hidden items-center gap-4 md:flex">
                <Link
                  to="/search"
                  className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
                  aria-label={t("nav.search", locale)}
                  title={t("nav.search", locale)}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                </Link>
                <AuthButton />
                <LocaleToggle />
                <ThemeToggle />
              </div>

              {/* Mobile */}
              <div className="flex items-center gap-3 md:hidden">
                <button
                  onClick={() => setOpen(!open)}
                  className="p-2 text-[var(--color-muted)]"
                  aria-label={open ? "Close menu" : "Open menu"}
                >
                  {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          {open && (
            <div className="flex flex-col gap-3 pb-2 pt-4 text-sm md:hidden">
              {allMobileLinks.map((n) => (
                <Link
                  key={n.href}
                  to={n.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "py-1 text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]",
                    isActive(n.href) && "text-[var(--color-fg)] font-medium",
                  )}
                >
                  {t(n.key, locale)}
                </Link>
              ))}
              <div className="flex items-center gap-4 border-t border-[var(--color-border)] pt-2">
                <LocaleToggle />
                <ThemeToggle />
              </div>
            </div>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <p className="text-center text-xs text-[var(--color-muted)]">
            © {new Date().getFullYear()} Jonatan Mata · v{__APP_VERSION__}
          </p>
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
