"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { GraphNode } from "@/lib/types";
import { TypeBadge, StatusBadge } from "@/components/badges";
import { Filters } from "@/components/filters";
import { t } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export default function TimelinePage() {
  const { locale } = usePrefs();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.graph({ type: type || undefined, status: status || undefined }).then((d) => setNodes(d.nodes));
  }, [type, status]);

  const sorted = [...nodes].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("timeline.title", locale)}</h1>
        <Filters type={type} status={status} onTypeChange={setType} onStatusChange={setStatus} />
      </div>
      <p className="text-sm text-muted-foreground">{t("timeline.count", locale, { count: sorted.length })}</p>
      <div className="space-y-1">
        {sorted.map((n) => (
          <Link
            key={n.id}
            href={`/node?id=${n.id}`}
            className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <span>{n.title}</span>
              <TypeBadge type={n.node_type} />
            </div>
            <StatusBadge status={n.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
