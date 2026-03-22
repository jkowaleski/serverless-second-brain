import { useEffect, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BundledLanguage } from "shiki";
import { Mermaid } from "./mermaid";

let highlighter: Awaited<ReturnType<typeof import("shiki")["createHighlighter"]>> | null = null;

async function getHighlighter() {
  if (!highlighter) {
    const { createHighlighter } = await import("shiki");
    highlighter = await createHighlighter({
      themes: ["github-light-default", "github-dark-default"],
      langs: ["typescript", "javascript", "json", "yaml", "bash", "python", "hcl", "sql", "html", "css", "markdown", "shell"],
    });
  }
  return highlighter;
}

function CodeBlock({ className, children }: ComponentProps<"code">) {
  const [html, setHtml] = useState<string | null>(null);
  const code = String(children).replace(/\n$/, "");
  const match = className?.match(/language-(\w+)/);
  const lang = match?.[1] ?? "";

  useEffect(() => {
    if (!lang || lang === "mermaid") return;
    let cancelled = false;
    getHighlighter().then((h) => {
      if (cancelled) return;
      try {
        setHtml(h.codeToHtml(code, {
          lang: lang as BundledLanguage,
          themes: { light: "github-light-default", dark: "github-dark-default" },
          defaultColor: false,
        }));
      } catch {
        // Language not loaded — fall back to plain
      }
    });
    return () => { cancelled = true; };
  }, [code, lang]);

  if (lang === "mermaid") return <Mermaid chart={code} />;
  if (html) return <div dangerouslySetInnerHTML={{ __html: html }} />;
  return <code className={className}>{children}</code>;
}

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/;

function YouTubeEmbed({ url }: { url: string }) {
  const m = url.match(YT_RE);
  if (!m) return null;
  return (
    <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-lg border border-[var(--color-border)]">
      <iframe
        src={`https://www.youtube.com/embed/${m[1]}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

// Preprocess MDX components into markdown
const MDX_YT = /<YouTube\s+id="([\w-]+)"\s*\/>/g;

function preprocess(md: string): string {
  return md.replace(MDX_YT, (_, id) => `[YouTube](https://www.youtube.com/watch?v=${id})`);
}

export function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="prose dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) { return <>{children}</>; },
          code(props) { return <CodeBlock {...props} />; },
          table(props) { return <div className="table-wrapper"><table {...props} /></div>; },
          img({ src, alt }) {
            return (
              <figure className="my-6">
                <img src={src} alt={alt ?? ""} loading="lazy" className="rounded-lg border border-[var(--color-border)]" />
                {alt && <figcaption className="mt-2 text-center text-xs text-[var(--color-muted)]">{alt}</figcaption>}
              </figure>
            );
          },
          a({ href, children }) {
            if (href && YT_RE.test(href)) return <YouTubeEmbed url={href} />;
            return <a href={href}>{children}</a>;
          },
          p({ children, node }) {
            const child = Array.isArray(children) && children.length === 1 ? children[0] : children;
            if (child && typeof child === "object" && "type" in child) {
              const t = (child as any).type;
              if (t === "img" || t === YouTubeEmbed) return <>{children}</>;
            }
            if (node?.children?.length === 1 && node.children[0].type === "element") {
              const tag = (node.children[0] as any).tagName;
              if (tag === "img") return <>{children}</>;
            }
            return <p>{children}</p>;
          },
        }}
      >
        {preprocess(content)}
      </ReactMarkdown>
    </div>
  );
}
