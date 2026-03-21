"use client";

import { Settings, Sun, Moon, Maximize, Minimize, Languages } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

function OptionRow<T extends string>({ options, value, onChange }: { options: { value: T; label: string; icon: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 px-2 pb-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function PrefsMenu() {
  const { theme, layout, locale, setTheme, setLayout, setLocale } = usePrefs();
  const icon = "h-3.5 w-3.5";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent transition-colors" aria-label="Settings">
        <Settings className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t("prefs.theme", locale)}</DropdownMenuLabel>
        <OptionRow
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: t("prefs.light", locale), icon: <Sun className={icon} /> },
            { value: "dark", label: t("prefs.dark", locale), icon: <Moon className={icon} /> },
          ]}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("prefs.layout", locale)}</DropdownMenuLabel>
        <OptionRow
          value={layout}
          onChange={setLayout}
          options={[
            { value: "boxed", label: t("prefs.boxed", locale), icon: <Minimize className={icon} /> },
            { value: "full", label: t("prefs.full", locale), icon: <Maximize className={icon} /> },
          ]}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("prefs.locale", locale)}</DropdownMenuLabel>
        <OptionRow
          value={locale}
          onChange={setLocale}
          options={[
            { value: "es", label: "ES", icon: <Languages className={icon} /> },
            { value: "en", label: "EN", icon: <Languages className={icon} /> },
          ]}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
