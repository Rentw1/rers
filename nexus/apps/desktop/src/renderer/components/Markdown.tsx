import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { api } from '../api';
import { Icon } from './Icon';

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] | string };
  children?: HastNode[];
}

const textOf = (n: HastNode | undefined): string => (!n ? '' : n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(textOf).join(''));

function CodeBlock({ node, children }: { node?: HastNode; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = node?.children?.find((c) => c.tagName === 'code');
  const cls = code?.properties?.className;
  const lang = (Array.isArray(cls) ? cls : [cls ?? '']).map(String).find((c) => c.startsWith('language-'))?.slice(9) ?? '';
  const text = textOf(code).replace(/\n$/, '');
  return (
    <div className="code">
      <div className="code-head">
        <span>{lang || 'code'}</span>
        <button
          className="icon-btn sm"
          title="Копировать"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function MarkdownImpl({ text, streaming, sans }: { text: string; streaming?: boolean; sans?: boolean }) {
  return (
    <div className={`md${sans ? ' sans' : ''}${streaming ? ' cursor' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ node, children }) => <CodeBlock node={node as unknown as HastNode}>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) api.open(href);
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <a
              href={String(src)}
              onClick={(e) => {
                e.preventDefault();
                if (src) api.open(String(src));
              }}
            >
              🖼 {alt || String(src)}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
export { Icon };
