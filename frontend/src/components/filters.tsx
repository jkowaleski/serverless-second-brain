"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t, typeLabel, statusLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

const TYPES = ["concept", "note", "experiment", "essay"];
const STATUSES = ["seed", "growing", "evergreen"];

interface Props {
  type: string;
  status: string;
  onTypeChange: (v: string) => void;
  onStatusChange: (v: string) => void;
}

export function Filters({ type, status, onTypeChange, onStatusChange }: Props) {
  const { locale } = usePrefs();
  return (
    <div className="flex flex-wrap gap-3">
      <Select value={type || "_all"} onValueChange={(v: string | null) => onTypeChange(!v || v === "_all" ? "" : v)}>
        <SelectTrigger className="w-[160px]" aria-label={t("filter.type", locale)}>
          <SelectValue placeholder={t("filter.all_types", locale)} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">{t("filter.all_types", locale)}</SelectItem>
          {TYPES.map((tp) => (
            <SelectItem key={tp} value={tp}>{typeLabel(tp, locale)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={status || "_all"} onValueChange={(v: string | null) => onStatusChange(!v || v === "_all" ? "" : v)}>
        <SelectTrigger className="w-[160px]" aria-label={t("filter.status", locale)}>
          <SelectValue placeholder={t("filter.all_statuses", locale)} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">{t("filter.all_statuses", locale)}</SelectItem>
          {STATUSES.map((st) => (
            <SelectItem key={st} value={st}>{statusLabel(st, locale)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
