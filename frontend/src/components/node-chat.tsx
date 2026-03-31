import { useState, useRef, useEffect, type ReactNode } from "react";
import { Send, Loader2, PenLine, Plus, Link2, ArrowUp, Eye, Lock, Trash2, MessageSquareText } from "lucide-react";
import { api } from "@/lib/api";
import { t, localized as loc } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: string;
}

export function NodeChat({ slug, node, onUpdate }: { slug: string; node?: { status?: string; visibility?: string }; onUpdate: () => void }) {
  const { locale } = usePrefs();
  const { user, token, setShowLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (!user) return null;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-fg)] hover:text-[var(--color-fg)] cursor-pointer">
        <MessageSquareText className="h-4 w-4" />
        {t("node_chat.open", locale)}
      </button>
    );
  }

  async function send() {
    if (!text.trim() || !token || loading) return;
    const msg = text.trim();
    const id = Date.now().toString();
    setText("");
    setMessages((m) => [...m, { id, role: "user", text: msg }]);
    setLoading(true);
    try {
      const res = await api.nodeChat(slug, msg, token);
      const reply = res.message;
      setMessages((m) => [...m, { id: `r-${id}`, role: "assistant", text: reply || "Done", action: res.action as string }]);
      if (res.action !== "none") onUpdate();
    } catch (err) {
      setMessages((m) => [...m, { id: `e-${id}`, role: "assistant", text: (err as Error).message }]);
    } finally {
      setLoading(false);
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
  };

  const quickActions: { key: DictKey; icon: ReactNode; prompt: Record<string, string> }[] = [
    { key: "node_chat.q.rewrite", icon: <PenLine className="h-3 w-3" />, prompt: { es: "Reescribe el contenido completo", en: "Rewrite the full content" } },
    { key: "node_chat.q.add_section", icon: <Plus className="h-3 w-3" />, prompt: { es: "Agrega una sección sobre ", en: "Add a section about " } },
    { key: "node_chat.q.tags", icon: <Plus className="h-3 w-3" />, prompt: { es: "Sugiere mejores tags", en: "Suggest better tags" } },
    { key: "node_chat.q.connect", icon: <Link2 className="h-3 w-3" />, prompt: { es: "Conecta con nodos relacionados", en: "Connect to related nodes" } },
    ...(node?.status === "seed" ? [{ key: "node_chat.q.promote" as DictKey, icon: <ArrowUp className="h-3 w-3" /> as ReactNode, prompt: { es: "Promueve a growing", en: "Promote to growing" } }] : []),
    ...(node?.visibility === "private" ? [{ key: "node_chat.q.publish" as DictKey, icon: <Eye className="h-3 w-3" /> as ReactNode, prompt: { es: "Hazlo público", en: "Make it public" } }] : [{ key: "node_chat.q.hide" as DictKey, icon: <Lock className="h-3 w-3" /> as ReactNode, prompt: { es: "Hazlo privado", en: "Make it private" } }]),
    { key: "node_chat.q.delete", icon: <Trash2 className="h-3 w-3" />, prompt: { es: "Elimina este nodo", en: "Delete this node" } },
  ];

  function fillPrompt(action: typeof quickActions[number]) {
    const p = action.prompt[locale] ?? action.prompt.en;
    setText(p);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">{t("node_chat.title", locale)}</span>
        <button onClick={() => setOpen(false)} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] cursor-pointer">✕</button>
      </div>

      {messages.length === 0 && (
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
          {quickActions.map((a) => (
            <button key={a.key} onClick={() => fillPrompt(a)} disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-fg)] hover:text-[var(--color-fg)] disabled:opacity-50 cursor-pointer">
              {a.icon}
              {t(a.key, locale)}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.role === "user" ? "bg-[var(--color-surface)] ml-8" : "border border-[var(--color-border)] mr-8"}`}>
              {m.text}
              {m.action && m.action !== "none" && (
                <span className="ml-2 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">{m.action}</span>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} rows={2} disabled={loading}
          className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)] disabled:opacity-50"
          placeholder={t("node_chat.placeholder", locale)} />
        <button onClick={send} disabled={!text.trim() || loading} aria-label="Send"
          className="mb-0.5 shrink-0 rounded-lg bg-[var(--color-fg)] p-2 text-[var(--color-bg)] transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-default cursor-pointer">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
