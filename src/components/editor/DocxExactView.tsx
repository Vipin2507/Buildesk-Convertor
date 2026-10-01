import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import {
  buildExactHtmlDocument,
  resolveNativePageNumbers,
  repaginateByHeight,
} from '../../core/converters/exact-html';
import './docx-exact.css';

interface DocxExactViewProps {
  data: ArrayBuffer;
  title?: string;
  originalDocxBase64?: string;
  className?: string;
  onExactHtml?: (html: string) => void;
}

export function DocxExactView({
  data,
  title = 'Document',
  originalDocxBase64,
  className = '',
  onExactHtml,
}: DocxExactViewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const onExactHtmlRef = useRef(onExactHtml);
  onExactHtmlRef.current = onExactHtml;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const body = bodyRef.current;
    const styleHost = styleRef.current;
    if (!body || !styleHost) return;

    body.innerHTML = '';
    styleHost.innerHTML = '';
    setLoading(true);
    setError(null);
    setPageCount(0);

    const copy = data.slice(0);

    void renderAsync(copy, body, styleHost, {
      className: 'docx-exact',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
      experimental: true,
      trimXmlDeclaration: true,
      ignoreLastRenderedPageBreak: false,
    })
      .then(async () => {
        if (cancelled) return;

        // Let layout settle, then height-paginate and resolve Word's own page fields
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await new Promise<void>((r) => setTimeout(r, 80));
        if (cancelled) return;

        try {
          if (document.fonts?.ready) await document.fonts.ready;
        } catch {
          /* ignore */
        }
        if (cancelled) return;

        repaginateByHeight(body, 'docx-exact');
        if (cancelled) return;

        const pages = resolveNativePageNumbers(body, 'docx-exact');
        setPageCount(pages);

        const styleNodes = [
          ...Array.from(styleHost.querySelectorAll('style')),
          ...Array.from(body.querySelectorAll('style')),
        ];
        const styleHtml = styleNodes.map((s) => s.outerHTML).join('\n');

        const wrapper =
          body.querySelector('.docx-exact-wrapper')
          || body.querySelector('[class$="-wrapper"]')
          || body;
        const bodyHtml = (wrapper as HTMLElement).outerHTML;

        const exactHtml = buildExactHtmlDocument({
          styleHtml,
          bodyHtml,
          title,
          originalDocxBase64,
          pageCount: pages,
        });
        onExactHtmlRef.current?.(exactHtml);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) {
          setError("We couldn't render this document with full Word fidelity.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data, title, originalDocxBase64]);

  return (
    <div className={`docx-exact-canvas ${className}`.trim()}>
      <div ref={styleRef} className="docx-exact-styles" aria-hidden />
      {loading && (
        <div className="docx-exact-loading" role="status">
          <div className="loading-spinner" />
          <span>Rendering Word layout…</span>
        </div>
      )}
      {error && <div className="docx-exact-error">{error}</div>}
      {!loading && !error && pageCount > 0 && (
        <div className="docx-exact-page-count" aria-live="polite">
          {pageCount} page{pageCount === 1 ? '' : 's'}
        </div>
      )}
      <div ref={bodyRef} className="docx-exact-body" />
    </div>
  );
}
