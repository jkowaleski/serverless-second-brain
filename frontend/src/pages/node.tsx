import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { NodeResponse } from "@/lib/types";
import { ContentMeta } from "@/components/badges";
import { MarkdownBody } from "@/components/markdown-body";
import { NodeDetailSkeleton } from "@/components/skeletons";
import { NodeChat } from "@/components/node-chat";
import { ReadAloud } from "@/components/read-aloud";
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
    loadNode();
  }, [slug, token, authLoading]);

  function loadNode() {
    setData(null);
    setError("");
    api.node(slug, { include_body: true }, token).then(setData).catch((e) => setError(e.message));
  }

  if (!slug) return <p className="py-12 text-center text-[var(--color-muted)]">{t("node.empty", locale)}</p>;
  if (error) return <p className="py-12 text-center text-red-500">{t("common.error", locale, { msg: error })}</p>;
  if (!data) return <NodeDetailSkeleton />;

  const { node, edges, related, body } = data;
  const section = TYPE_TO_SECTION[node.node_type] ?? "concepts";

  const readableText = body || node.summary;

  return (
    <article className="space-y-8">
      {/* Back link + read aloud */}
      <div className="flex items-center justify-between">
        <Link to={`/${section}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]">
          <ArrowLeft className="h-4 w-4" />
          {typeLabel(node.node_type, locale)}s
        </Link>
        <ReadAloud text={readableText} locale={locale} />
      </div>

      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold">{localized(node, "title", locale)}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {localized(node, "summary", locale)}
        </p>
        <ContentMeta type={node.node_type} status={node.status} tags={node.tags} />
      </header>

      {/* Body content */}
      {body ? (
        <MarkdownBody content={body} />
      ) : node.word_count === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          {t("node.enriching", locale)}
        </div>
      ) : null}

      {/* Related */}
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

      {/* Chat editor */}
      <NodeChat slug={slug} node={node} onUpdate={loadNode} />

      {/* Bottom back link */}
      <Link to={`/${section}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]">
        <ArrowLeft className="h-4 w-4" />
        {typeLabel(node.node_type, locale)}s
      </Link>
    </article>
  );
}
