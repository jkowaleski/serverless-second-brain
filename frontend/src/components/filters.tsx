import { TYPE_COLORS } from "@/lib/constants";
import { t, typeLabel, statusLabel } from "@/lib/i18n";
import { StatusIcon } from "@/components/badges";
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted)]">{t("filter.type", locale)}</span>
        {TYPES.map((tp) => (
          <button key={tp} onClick={() => onTypeChange(type === tp ? "" : tp)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              !type || type === tp
                ? "border-[var(--color-border)] text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-muted)] opacity-40"
            }`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[tp] }} />
            {typeLabel(tp, locale)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted)]">{t("filter.status", locale)}</span>
        {STATUSES.map((st) => (
          <button key={st} onClick={() => onStatusChange(status === st ? "" : st)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              !status || status === st
                ? "border-[var(--color-border)] text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-muted)] opacity-40"
            }`}>
            <StatusIcon status={st} className="h-3 w-3" />
            {statusLabel(st, locale)}
          </button>
        ))}
      </div>
    </div>
  );
}
