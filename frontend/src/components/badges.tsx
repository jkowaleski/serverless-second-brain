import { Link } from "react-router-dom";
import { Sprout, Leaf, TreePine } from "lucide-react";
import { TYPE_COLORS } from "@/lib/constants";
import { typeLabel, statusLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

const STATUS_CONFIG: Record<string, { Icon: typeof Sprout; color: string }> = {
  seed: { Icon: Sprout, color: "#a87c4f" },
  growing: { Icon: Leaf, color: "#84cc16" },
  evergreen: { Icon: TreePine, color: "#16a34a" },
};

export function StatusIcon({ status, className = "h-2.5 w-2.5" }: { status: string; className?: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  return <span style={{ color: config.color }}><config.Icon className={className} /></span>;
}

export function TypeBadge({ type }: { type: string }) {
  const { locale } = usePrefs();
  const color = TYPE_COLORS[type] ?? "#71717a";
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: color, color }}>
      {typeLabel(type, locale)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { locale } = usePrefs();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted)]">
      <StatusIcon status={status} />
      {statusLabel(status, locale)}
    </span>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((tag) => (
        <Link key={tag} to={`/search?q=${encodeURIComponent(tag)}`} className="text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]">
          #{tag}
        </Link>
      ))}
    </>
  );
}

export function ContentMeta({ type, status, tags }: { type: string; status: string; tags: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <StatusBadge status={status} />
      <TagList tags={tags} />
    </div>
  );
}
