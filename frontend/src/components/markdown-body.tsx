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

  return (
    <code className={className}>{children}</code>
  );
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
