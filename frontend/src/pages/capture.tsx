import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { LogIn, Send, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { TypeBadge, StatusBadge, TagList } from "@/components/badges";

const TYPES = ["concept", "note", "experiment", "essay"] as const;

interface CaptureResult { slug: string; title: string; node_type: string; status: string; tags: string[]; }
interface Message { role: "user" | "system"; text?: string; result?: CaptureResult; error?: string; }

export default function Capture() {
  const { user, token, setShowLogin } = useAuth();
  const { locale } = usePrefs();
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<string>("concept");
  const [lang, setLang] = useState<"es" | "en">(locale);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showUrl, setShowUrl] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>
        <div className="rounded-lg border border-[var(--color-border)] p-8 text-center space-y-4">
          <p className="text-sm text-[var(--color-muted)]">{t("capture.login_required", locale)}</p>
          <button onClick={() => setShowLogin(true)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] cursor-pointer transition-opacity hover:opacity-80">
            <LogIn className="h-4 w-4" />
            {t("auth.login", locale)}
          </button>
        </div>
      </div>
    );
  }

  const charCount = text.length;
  const valid = charCount >= 50;

  async function submit() {
    if (!valid || !token || loading) return;
    const content = text;
    setMessages((m) => [...m, { role: "user", text: content }]);
    setText(""); setShowUrl(false);
    setLoading(true);
    try {
      const res = await api.capture({ text: content, url: url || undefined, type, language: lang }, token);
      setMessages((m) => [...m, { role: "system", result: res }]);
      setUrl("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.includes("401")) { setShowLogin(true); setLoading(false); return; }
      setMessages((m) => [...m, { role: "system", error: msg }]);
    } finally { setLoading(false); textareaRef.current?.focus(); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 12rem)" }}>
      <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>

      {/* Messages */}
      <div className="flex-1 space-y-3 py-6">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--color-muted)] text-center py-12">{t("capture.empty", locale)}</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] rounded-lg bg-[var(--color-fg)] text-[var(--color-bg)] px-3 py-2 text-sm whitespace-pre-wrap">
                {(msg.text?.length ?? 0) > 200 ? msg.text!.slice(0, 200) + "..." : msg.text}
              </div>
            ) : msg.error ? (
              <div className="max-w-[85%] rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">
                {msg.error}
              </div>
            ) : msg.result ? (
              <div className="max-w-[85%] rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/5 px-3 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
                  <span className="text-sm font-medium">{msg.result.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={msg.result.node_type} /><StatusBadge status={msg.result.status} />
                </div>
                <div className="flex flex-wrap gap-1.5"><TagList tags={msg.result.tags} /></div>
                <Link to={`/node?id=${msg.result.slug}`} className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
                  {t("capture.view_node", locale)} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : null}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] pt-3 pb-1 space-y-2">
        {showUrl && (
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]" />
        )}
        <div className="flex gap-2">
          <textarea ref={textareaRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
            rows={2} placeholder={t("capture.chat_placeholder", locale)}
            className="flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]" />
          <button onClick={submit} disabled={!valid || loading}
            className="self-end rounded-lg bg-[var(--color-fg)] p-2.5 text-[var(--color-bg)] cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-default">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex gap-1" role="radiogroup" aria-label={t("capture.type_label", locale)}>
            {TYPES.map((tp) => (
              <button key={tp} type="button" role="radio" aria-checked={type === tp} onClick={() => setType(tp)}
                className={`rounded-md border px-2 py-0.5 cursor-pointer transition-colors ${type === tp ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"}`}>
                {t(`type.${tp}` as Parameters<typeof t>[0], locale)}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label={t("capture.lang_label", locale)}>
            {(["es", "en"] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                className={`rounded-md border px-2 py-0.5 uppercase cursor-pointer transition-colors ${lang === l ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"}`}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowUrl(!showUrl)}
            className={`rounded-md border px-2 py-0.5 cursor-pointer transition-colors ${showUrl ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"}`}>
            URL
          </button>
          <span className={`ml-auto tabular-nums ${valid ? "text-[var(--color-muted)]" : "text-red-500"}`}>{charCount}/50</span>
        </div>
      </div>
    </div>
  );
}
