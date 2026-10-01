import { useEffect, useRef } from 'react';
import './docx-exact.css';

interface HtmlExactViewProps {
  /** Full HTML document or body fragment from Exact Word export */
  html: string;
  className?: string;
}

/**
 * Renders a previously exported Exact Word HTML snapshot.
 * Uses a sandboxed iframe so original Word styles don't leak into the app shell.
 */
export function HtmlExactView({ html, className = '' }: HtmlExactViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html.includes('<html') ? html : wrapFragment(html));
    doc.close();
  }, [html]);

  return (
    <div className={`docx-exact-canvas ${className}`.trim()}>
      <iframe
        ref={iframeRef}
        className="html-exact-frame"
        title="Exact document view"
        sandbox="allow-same-origin"
      />
    </div>
  );
}

function wrapFragment(fragment: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    html,body{margin:0;padding:0;background:#e8eaee}
    body{padding:32px 24px}
  </style></head><body>${fragment}</body></html>`;
}
