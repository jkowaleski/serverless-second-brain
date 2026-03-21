"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

type Theme = "light" | "dark";
type Layout = "boxed" | "full";

interface Prefs {
  theme: Theme;
  layout: Layout;
  locale: Locale;
  setTheme: (v: Theme) => void;
  setLayout: (v: Layout) => void;
  setLocale: (v: Locale) => void;
}

const Ctx = createContext<Prefs | null>(null);

function read<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return (localStorage.getItem(key) as T) ?? fallback;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [layout, setLayoutState] = useState<Layout>("boxed");
  const [locale, setLocaleState] = useState<Locale>("es");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(read("ssb-theme", prefersDark ? "dark" : "light"));
    setLayoutState(read("ssb-layout", "boxed"));
    setLocaleState(read("ssb-locale", "es"));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = locale;
  }, [theme, locale, mounted]);

  const persist = useCallback((key: string, val: string) => localStorage.setItem(key, val), []);

  const setTheme = useCallback((v: Theme) => { setThemeState(v); persist("ssb-theme", v); }, [persist]);
  const setLayout = useCallback((v: Layout) => { setLayoutState(v); persist("ssb-layout", v); }, [persist]);
  const setLocale = useCallback((v: Locale) => { setLocaleState(v); persist("ssb-locale", v); }, [persist]);

  // Prevent flash — render nothing until mounted
  if (!mounted) return null;

  return (
    <Ctx.Provider value={{ theme, layout, locale, setTheme, setLayout, setLocale }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs must be inside PrefsProvider");
  return ctx;
}
