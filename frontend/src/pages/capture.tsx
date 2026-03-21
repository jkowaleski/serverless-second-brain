import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { TypeBadge, StatusBadge, TagList } from "@/components/badges";

const TYPES = ["concept", "note", "experiment", "essay"];

interface CaptureResult { slug: string; title: string; node_type: string; status: string; tags: string[]; }

export default function Capture() {
  const { user, token, login } = useAuth();
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
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>
        <p className="text-[var(--color-muted)] text-center max-w-sm">{t("capture.login_required", locale)}</p>
        <button onClick={login} className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-80">
          <LogIn className="h-4 w-4" />
          {t("auth.login", locale)}
        </button>
      </div>
    );
  }

  const charCount = text.length;
  const valid = charCount >= 50;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !token) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api.capture({ text, url: url || undefined, type, language: lang }, token);
      setResult(res); setText(""); setUrl("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.includes("401")) { login(); return; }
      setError(msg);
    } finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>

      {result && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">{t("capture.success", locale)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{result.title}</span>
            <TypeBadge type={result.node_type} /><StatusBadge status={result.status} />
          </div>
          <div className="flex flex-wrap gap-2"><TagList tags={result.tags} /></div>
          <Link to={`/node?id=${result.slug}`} className="inline-block text-sm text-[var(--color-accent)] hover:underline">{t("capture.view_node", locale)}</Link>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="rounded-xl border border-[var(--color-border)] p-4 sm:p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="capture-text" className="text-sm font-medium">{t("capture.text_label", locale)}</label>
            <textarea id="capture-text" value={text} onChange={(e) => setText(e.target.value)} rows={6}
              className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)] resize-y"
              placeholder={t("capture.text_placeholder", locale)} />
            <p className={`text-xs ${valid ? "text-[var(--color-muted)]" : "text-red-500"}`}>{t("capture.char_count", locale, { count: charCount })}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="capture-url" className="text-sm font-medium">{t("capture.url_label", locale)}</label>
            <input id="capture-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]" />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("capture.type_label", locale)}</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none">
                {TYPES.map((tp) => <option key={tp} value={tp}>{t(`type.${tp}` as Parameters<typeof t>[0], locale)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("capture.lang_label", locale)}</label>
              <select value={lang} onChange={(e) => setLang(e.target.value as "es" | "en")}
                className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none">
                <option value="es">ES</option>
                <option value="en">EN</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={!valid || loading}
            className="rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-80 disabled:opacity-50">
            {loading ? t("capture.submitting", locale) : t("capture.submit", locale)}
          </button>
        </form>
      </div>
    </div>
  );
}
