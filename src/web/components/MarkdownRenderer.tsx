import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      className="markdown-content"
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const inline = !match;
          
          if (inline) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }

          return (
            <CodeBlock language={match[1]}>
              {String(children).replace(/\n$/, '')}
            </CodeBlock>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function CodeBlock({ children, language }: { children: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          title="Copy code"
        >
          {copied ? (
            <CheckIcon className="w-4 h-4 text-green-400" />
          ) : (
            <ClipboardIcon className="w-4 h-4" />
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
