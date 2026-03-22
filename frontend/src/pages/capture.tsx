import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, Send, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { TypeBadge, StatusBadge, TagList } from "@/components/badges";

const TYPES = ["concept", "note", "experiment", "essay"];

interface CaptureResult { slug: string; title: string; node_type: string; status: string; tags: string[]; }

export default function Capture() {
  const { user, token, setShowLogin } = useAuth();
  const { locale } = usePrefs();
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("concept");
  const [lang, setLang] = useState<"es" | "en">(locale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CaptureResult | null>(null);

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>
        <div className="rounded-lg border border-[var(--color-border)] p-8 text-center space-y-4">
          <p className="text-sm text-[var(--color-muted)]">{t("capture.login_required", locale)}</p>
          <button onClick={() => setShowLogin(true)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-80">
            <LogIn className="h-4 w-4" />
            {t("auth.login", locale)}
          </button>
        </div>
      </div>
    );
  }

  const charCount = text.length;
  const valid = charCount >= 50;
  const progress = Math.min(charCount / 50, 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !token) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api.capture({ text, url: url || undefined, type, language: lang }, token);
      setResult(res); setText(""); setUrl("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.includes("401")) { setShowLogin(true); return; }
      setError(msg);
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>
        <span className="text-xs text-[var(--color-muted)]">{user.email}</span>
      </div>

      {result && (
        <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
            <p className="text-sm font-medium text-[var(--color-accent)]">{t("capture.success", locale)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{result.title}</span>
            <TypeBadge type={result.node_type} /><StatusBadge status={result.status} />
          </div>
          <div className="flex flex-wrap gap-2"><TagList tags={result.tags} /></div>
          <Link to={`/node?id=${result.slug}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline">
            {t("capture.view_node", locale)} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="rounded-lg border border-[var(--color-border)] p-4 sm:p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="capture-text" className="text-sm font-medium">{t("capture.text_label", locale)}</label>
            <textarea id="capture-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} disabled={loading}
              className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)] resize-y disabled:opacity-50"
              placeholder={t("capture.text_placeholder", locale)} />
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-[var(--color-border)] overflow-hidden">
                <div className={`h-full rounded-full transition-all ${valid ? "bg-[var(--color-accent)]" : "bg-[var(--color-muted)]"}`} style={{ width: `${progress * 100}%` }} />
              </div>
              <span className={`text-xs tabular-nums ${valid ? "text-[var(--color-muted)]" : "text-red-500"}`}>{charCount}/50</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="capture-url" className="text-sm font-medium">{t("capture.url_label", locale)}</label>
            <input id="capture-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." disabled={loading}
              className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)] disabled:opacity-50" />
          </div>

          <div className="flex flex-wrap gap-4">
            <fieldset className="space-y-1.5" disabled={loading}>
              <legend className="text-sm font-medium">{t("capture.type_label", locale)}</legend>
              <div className="flex flex-wrap gap-1.5" role="radiogroup">
                {TYPES.map((tp) => (
                  <button key={tp} type="button" role="radio" aria-checked={type === tp} onClick={() => setType(tp)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${type === tp ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]"}`}>
                    {t(`type.${tp}` as Parameters<typeof t>[0], locale)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-1.5" disabled={loading}>
              <legend className="text-sm font-medium">{t("capture.lang_label", locale)}</legend>
              <div className="flex gap-1.5" role="radiogroup">
                {(["es", "en"] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium uppercase cursor-pointer transition-colors ${lang === l ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <button type="submit" disabled={!valid || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-80 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? t("capture.submitting", locale) : t("capture.submit", locale)}
          </button>
        </form>
      </div>
    </div>
  );
}
