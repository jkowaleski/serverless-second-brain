import { Badge } from "@/components/ui/badge";
import { TYPE_COLORS } from "@/lib/constants";
import { typeLabel, statusLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export function TypeBadge({ type }: { type: string }) {
  const { locale } = usePrefs();
  const color = TYPE_COLORS[type] ?? "#71717a";
  return (
    <Badge variant="outline" style={{ borderColor: color, color }}>
      {typeLabel(type, locale)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { locale } = usePrefs();
  return (
    <Badge variant="secondary">
      {statusLabel(status, locale)}
    </Badge>
  );
}

export function TagBadge({ tag }: { tag: string }) {
  return <Badge variant="outline">{tag}</Badge>;
}
