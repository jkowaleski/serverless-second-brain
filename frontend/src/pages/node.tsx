import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { NodeResponse } from "@/lib/types";
import { ContentMeta } from "@/components/badges";
import { MarkdownBody } from "@/components/markdown-body";
import { NodeDetailSkeleton } from "@/components/skeletons";
import { t, localized, typeLabel } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";

const TYPE_TO_SECTION: Record<string, string> = {
  concept: "concepts",
  note: "notes",
  experiment: "experiments",
  essay: "essays",
};

export default function NodePage() {
  const { locale } = usePrefs();
  const { token, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const slug = params.get("id") ?? "";
  const [data, setData] = useState<NodeResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug || authLoading) return;
    setData(null);
    setError("");
    api.node(slug, { include_body: true, language: locale }, token).then(setData).catch((e) => setError(e.message));
  }, [slug, locale, token, authLoading]);

  if (!slug) return <p className="py-12 text-center text-[var(--color-muted)]">{t("node.empty", locale)}</p>;
  if (error) return <p className="py-12 text-center text-red-500">{t("common.error", locale, { msg: error })}</p>;
  if (!data) return <NodeDetailSkeleton />;

  const { node, edges, related, body } = data;
  const section = TYPE_TO_SECTION[node.node_type] ?? "concepts";

  return (
    <article className="space-y-8">
      {/* Back link to section */}
      <Link to={`/${section}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]">
        <ArrowLeft className="h-4 w-4" />
        {typeLabel(node.node_type, locale)}s
      </Link>

      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold">{node.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {localized(node, "summary", locale)}
        </p>
        <ContentMeta type={node.node_type} status={node.status} tags={node.tags} />
      </header>

      {/* Body content */}
      {body ? (
        <MarkdownBody content={body} />
      ) : (
        /* Bilingual summaries fallback when no body */
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2">
            <h2 className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">{t("node.summary_es", locale)}</h2>
            <p className="text-sm leading-relaxed">{localized(node, "summary", "es")}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2">
            <h2 className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">{t("node.summary_en", locale)}</h2>
            <p className="text-sm leading-relaxed">{localized(node, "summary", "en")}</p>
          </div>
        </div>
      )}

      {/* Related — matching jonmatum.com */}
      {related.length > 0 && (
        <section className="space-y-3 border-t border-[var(--color-border)] pt-8">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">
            {t("node.related", locale, { count: related.length })}
          </h2>
          <ul className="space-y-2">
            {related.map((r) => {
              const rTitle = localized(r, "title", locale);
              const rSummary = localized(r, "summary", locale);
              return (
                <li key={r.id}>
                  <Link to={`/node?id=${r.id}`} className="block rounded-lg border border-[var(--color-border)] p-3 transition-colors hover:border-[var(--color-muted)]">
                    <span className="text-sm font-medium">{rTitle}</span>
                    {rSummary && <p className="mt-1 text-xs text-[var(--color-muted)] line-clamp-2">{rSummary}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Bottom back link */}
      <Link to={`/${section}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]">
        <ArrowLeft className="h-4 w-4" />
        {typeLabel(node.node_type, locale)}s
      </Link>
    </article>
  );
}
