import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { LogIn, Send, ArrowRight, Globe, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { api } from "@/lib/api";
import { t, localized } from "@/lib/i18n";
import { TypeBadge, StatusBadge, TagList } from "@/components/badges";

const pulse = "animate-pulse rounded bg-[var(--color-border)]";

function ResponseSkeleton() {
  return (
    <div className="max-w-[85%] rounded-lg border border-[var(--color-border)] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className={`h-4 w-32 ${pulse}`} />
        <div className={`h-5 w-16 rounded-full ${pulse}`} />
        <div className={`h-5 w-14 rounded-full ${pulse}`} />
      </div>
      <div className={`h-3 w-full ${pulse}`} />
      <div className={`h-3 w-3/4 ${pulse}`} />
      <div className="flex gap-1.5">
        <div className={`h-4 w-12 ${pulse}`} />
        <div className={`h-4 w-16 ${pulse}`} />
        <div className={`h-4 w-10 ${pulse}`} />
      </div>
    </div>
  );
}

interface CaptureResult {
  slug: string; title: string; title_es?: string; title_en?: string;
  summary_es?: string; summary_en?: string; node_type: string; status: string; tags: string[];
}

interface Message {
  id: string; text: string; result?: CaptureResult; error?: string;
  loading?: boolean; visibility?: "public" | "private"; visibilityPending?: boolean;
}

export default function Capture() {
  const { user, token, setShowLogin } = useAuth();
  const { locale } = usePrefs();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>
        <div className="rounded-lg border border-[var(--color-border)] p-8 text-center space-y-4">
          <p className="text-sm text-[var(--color-muted)]">{t("capture.login_required", locale)}</p>
          <button onClick={() => setShowLogin(true)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-80">
            <LogIn className="h-4 w-4" /> {t("auth.login", locale)}
          </button>
        </div>
      </div>
    );
  }

  const valid = text.length >= 50;

  async function send() {
    if (!valid || !token) return;
    const input = text.trim();
    const id = Date.now().toString();
    setText("");
    setMessages((m) => [...m, { id, text: input, loading: true }]);
    try {
      const raw = await api.capture({ text: input, visibility: "private", language: locale }, token);
      const node = (typeof raw === "string" ? JSON.parse(raw) : raw) as CaptureResult;
      setMessages((m) => m.map((msg) =>
        msg.id === id ? { ...msg, loading: false, result: node, visibility: "private", visibilityPending: true } : msg
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.includes("401")) { setShowLogin(true); return; }
      setMessages((m) => m.map((msg2) => msg2.id === id ? { ...msg2, loading: false, error: msg } : msg2));
    }
  }

  async function setVis(msgId: string, slug: string, vis: "public" | "private") {
    if (!token) return;
    setMessages((m) => m.map((msg) => msg.id === msgId ? { ...msg, visibilityPending: false, visibility: vis } : msg));
    if (vis !== "private") {
      try { await api.patchVisibility(slug, vis, token); } catch { /* optimistic */ }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header — fixed */}
      <div className="flex shrink-0 items-center justify-between pb-4">
        <h1 className="text-2xl font-semibold">{t("capture.title", locale)}</h1>
        <span className="truncate text-xs text-[var(--color-muted)]">{user.email}</span>
      </div>

      {/* Messages — scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--color-muted)]">{t("capture.empty", locale)}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            {/* User bubble */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-[var(--color-fg)] px-3 py-2 text-sm text-[var(--color-bg)]">
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>

            {/* Skeleton loading */}
            {msg.loading && <ResponseSkeleton />}

            {/* Error */}
            {msg.error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{msg.error}</div>
            )}

            {/* Result */}
            {msg.result && (
              <div className="max-w-[85%] space-y-3">
                <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{localized(msg.result, "title", locale) || msg.result.title}</span>
                    <TypeBadge type={msg.result.node_type} />
                    <StatusBadge status={msg.result.status} />
                  </div>
                  {(msg.result.summary_es || msg.result.summary_en) && (
                    <p className="text-xs text-[var(--color-muted)] line-clamp-2">{localized(msg.result, "summary", locale)}</p>
                  )}
                  <div className="flex flex-wrap gap-1"><TagList tags={msg.result.tags} /></div>
                  <div className="flex items-center gap-3">
                    <Link to={`/node?id=${msg.result.slug}`} className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
                      {t("capture.view_node", locale)} <ArrowRight className="h-3 w-3" />
                    </Link>
                    {!msg.visibilityPending && msg.visibility && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                        {msg.visibility === "public" ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        {t(`visibility.${msg.visibility}` as Parameters<typeof t>[0], locale)}
                      </span>
                    )}
                  </div>
                </div>

                {msg.visibilityPending && (
                  <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
                    <p className="text-sm">{t("capture.visibility_question", locale)}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setVis(msg.id, msg.result!.slug, "private")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]">
                        <Lock className="h-3 w-3" /> {t("visibility.private", locale)}
                      </button>
                      <button onClick={() => setVis(msg.id, msg.result!.slug, "public")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors hover:border-[var(--color-muted)] hover:text-[var(--color-fg)]">
                        <Globe className="h-3 w-3" /> {t("visibility.public", locale)}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input — fixed at bottom */}
      <div className="shrink-0 border-t border-[var(--color-border)] pt-3">
        <div className="relative">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} rows={2}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
            placeholder={t("capture.chat_placeholder", locale)}
          />
          <button onClick={send} disabled={!valid} aria-label={t("capture.submit", locale)}
            className="absolute bottom-2 right-2 rounded-md p-1 text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-30 disabled:cursor-default cursor-pointer">
            <Send className="h-4 w-4" />
          </button>
        </div>
        <span className={`mt-1 block text-xs ${text.length >= 50 ? "text-[var(--color-muted)]" : "text-red-500"}`}>{text.length}/50</span>
      </div>
    </div>
  );
}
