import { Link } from "react-router-dom";
import { StatusBadge } from "./badges";
import { TYPE_COLORS } from "@/lib/constants";

interface Props {
  id: string;
  title: string;
  summary?: string;
  node_type: string;
  status: string;
  tags: string[];
  score?: number;
  extra?: React.ReactNode;
}

export function NodeCard({ id, title, summary, node_type, status, score, extra }: Props) {
  return (
    <Link to={`/node?id=${id}`} className="flex overflow-hidden rounded-lg border border-[var(--color-border)] transition-colors hover:border-[var(--color-muted)]">
      <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: TYPE_COLORS[node_type] }} />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          <StatusBadge status={status} />
          {score != null && <span className="text-xs text-[var(--color-muted)] shrink-0">{Math.round(score * 100)}%</span>}
        </div>
        {summary && <p className="mt-1 text-xs text-[var(--color-muted)] line-clamp-2">{summary}</p>}
        {extra}
      </div>
    </Link>
  );
}
