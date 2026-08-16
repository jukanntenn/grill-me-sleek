// Markdown — renders AI-authored prose (grilling description, question text,
// explanation) as GitHub-flavored markdown.
//
// react-markdown renders to React elements and leaves raw HTML escaped by
// default (no rehype-raw), so AI-supplied content cannot inject markup.
// Element styling uses the same design tokens as the rest of the app.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body text-body text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-[var(--spacing-xs)] last:mb-0">{children}</p>
  ),
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline hover:opacity-80"
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-[var(--spacing-xs)] list-disc pl-[var(--spacing-md)] last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-[var(--spacing-xs)] list-decimal pl-[var(--spacing-md)] last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="mb-1">{children}</li>,
  h1: heading("mb-[var(--spacing-xs)] mt-[var(--spacing-sm)] text-base font-semibold"),
  h2: heading("mb-[var(--spacing-xs)] mt-[var(--spacing-sm)] text-base font-semibold"),
  h3: heading("mb-[var(--spacing-xxs)] mt-[var(--spacing-sm)] text-sm font-semibold"),
  h4: heading("mb-[var(--spacing-xxs)] mt-[var(--spacing-xs)] text-sm font-semibold"),
  h5: heading("mb-[var(--spacing-xxs)] mt-[var(--spacing-xs)] text-sm font-semibold"),
  h6: heading("mb-[var(--spacing-xxs)] mt-[var(--spacing-xs)] text-sm font-semibold"),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-hairline-strong text-mute mb-[var(--spacing-xs)] border-l-2 pl-[var(--spacing-md)] last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    if (className) {
      // Fenced code block — pre/code split keeps long lines scrollable.
      return <code className="block overflow-x-auto font-mono text-xs">{children}</code>;
    }
    return (
      <code className="border-hairline bg-canvas rounded-[var(--radius-xs)] border px-1 py-0.5 font-mono text-xs">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="border-hairline bg-canvas mb-[var(--spacing-xs)] rounded-[var(--radius-sm)] border p-[var(--spacing-sm)] last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-[var(--spacing-xs)] overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-hairline bg-canvas px-[var(--spacing-sm)] py-[var(--spacing-xxs)] text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border-hairline px-[var(--spacing-sm)] py-[var(--spacing-xxs)] align-top">
      {children}
    </td>
  ),
};

function heading(className: string) {
  return function Heading({ children }: { children?: ReactNode }) {
    return <div className={className}>{children}</div>;
  };
}
