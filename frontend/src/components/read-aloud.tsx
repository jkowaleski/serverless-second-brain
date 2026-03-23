import { useState, useEffect, useCallback } from "react";
import { Volume2, Pause, Square } from "lucide-react";
import { t, type Locale } from "@/lib/i18n";

type Status = "idle" | "playing" | "paused";

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\|.*\|$/gm, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*`>|_~]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

export function ReadAloud({ text, locale }: { text: string; locale: Locale }) {
  const [status, setStatus] = useState<Status>("idle");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported("speechSynthesis" in window);
    return () => { speechSynthesis.cancel(); };
  }, []);

  // Reset when content changes
  useEffect(() => { speechSynthesis.cancel(); setStatus("idle"); }, [text]);

  const readable = stripMarkdown(text);

  const speak = useCallback(() => {
    if (!supported) return;
    if (status === "paused") { speechSynthesis.resume(); setStatus("playing"); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(readable);
    u.lang = locale === "en" ? "en-US" : "es-ES";
    u.onend = () => setStatus("idle");
    u.onerror = () => setStatus("idle");
    speechSynthesis.speak(u);
    setStatus("playing");
  }, [readable, locale, status, supported]);

  const pause = useCallback(() => { speechSynthesis.pause(); setStatus("paused"); }, []);
  const stop = useCallback(() => { speechSynthesis.cancel(); setStatus("idle"); }, []);

  if (!supported || !readable) return null;

  return (
    <div className="inline-flex items-center gap-1">
      {status !== "playing" && (
        <button onClick={speak} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] cursor-pointer">
          <Volume2 className="h-4 w-4" />
          {t(status === "paused" ? "read_aloud.resume" : "read_aloud.listen", locale)}
        </button>
      )}
      {status === "playing" && (
        <button onClick={pause} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] cursor-pointer">
          <Pause className="h-4 w-4" />
          {t("read_aloud.pause", locale)}
        </button>
      )}
      {status !== "idle" && (
        <button onClick={stop} className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] cursor-pointer" aria-label={t("read_aloud.stop", locale)}>
          <Square className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
