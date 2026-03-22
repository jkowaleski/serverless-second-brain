import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

let idCounter = 0;

export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const idRef = useRef(`mermaid-${++idCounter}`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then((m) => {
      if (cancelled) return;
      m.default.initialize({ startOnLoad: false, theme: "dark" });
      m.default.render(idRef.current, chart).then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      });
    });
    return () => { cancelled = true; };
  }, [chart]);

  if (!svg) return <div className="flex justify-center py-4 text-sm text-[var(--color-muted)]">Loading diagram...</div>;

  return (
    <>
      <div className="group relative">
        <button onClick={() => setFull(true)} className="absolute right-2 top-2 z-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--color-fg)]" aria-label="Fullscreen">
          <Maximize2 className="h-4 w-4" />
        </button>
        <div className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {full && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]">
          <button onClick={() => setFull(false)} className="absolute right-3 top-3 z-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]" aria-label="Exit fullscreen">
            <Minimize2 className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-center overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="pb-3 text-center text-xs text-[var(--color-muted)]">Esc to close</p>
        </div>
      )}
    </>
  );
}
