import { useMemo } from 'react';
import { DocxExactView } from './editor/DocxExactView';
import { HtmlExactView } from './editor/HtmlExactView';
import { DocumentEditor } from './editor/DocumentEditor';
import { useDocStore } from '../store/docStore';
import { base64ToArrayBuffer } from '../utils/binary';
import { cn } from '../lib/utils';
import type { Editor } from '@tiptap/react';
import '../components/editor/docx-exact.css';
import '../styles/editor.css';

interface PaperViewerProps {
  onEditorReady?: (editor: Editor) => void;
  className?: string;
}

export function PaperViewer({ onEditorReady, className }: PaperViewerProps) {
  const doc = useDocStore((s) => (s.activeId ? s.docs[s.activeId] : null));
  const viewMode = useDocStore((s) => s.viewMode);
  const zoom = useDocStore((s) => s.zoom);
  const setExactHtml = useDocStore((s) => s.setExactHtml);
  const updateFromEditor = useDocStore((s) => s.updateFromEditor);

  const docxBytes = useMemo(() => {
    if (!doc?.originalDocxBase64) return null;
    try {
      return base64ToArrayBuffer(doc.originalDocxBase64);
    } catch {
      return null;
    }
  }, [doc?.originalDocxBase64]);

  if (!doc) return null;

  return (
    <div className={cn('bc-canvas flex h-full min-h-0 flex-col', className)}>
      <div className="flex items-center justify-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)]">
        <span>
          Page size A4 · Zoom {zoom}%
        </span>
        <ZoomControls />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="mx-auto origin-top py-6"
          style={{ transform: `scale(${zoom / 100})`, width: `${10000 / zoom}%`, maxWidth: 'none' }}
        >
          {viewMode === 'exact' ? (
            docxBytes ? (
              <DocxExactView
                data={docxBytes}
                title={doc.title}
                originalDocxBase64={doc.originalDocxBase64}
                onExactHtml={(html) => {
                  const pages = (html.match(/<section\b[^>]*class=["'][^"']*docx-exact/gi) || []).length;
                  setExactHtml(html, pages || doc.pageCount);
                }}
              />
            ) : (
              <HtmlExactView html={doc.exactHtml} />
            )
          ) : (
            <div className="mx-auto max-w-[794px] px-[clamp(24px,6vw,72px)]">
              <div className="bc-paper bc-paper-a4 mx-auto p-12">
                <DocumentEditor
                  html={doc.editorBodyHtml || '<p></p>'}
                  onUpdate={(html) => updateFromEditor(html)}
                  onReady={onEditorReady}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ZoomControls() {
  const zoom = useDocStore((s) => s.zoom);
  const setZoom = useDocStore((s) => s.setZoom);
  return (
    <div className="ml-auto flex items-center gap-1">
      <button
        type="button"
        className="min-h-8 min-w-8 rounded-md border border-[var(--line)] px-2"
        aria-label="Zoom out"
        onClick={() => setZoom(zoom - 10)}
      >
        −
      </button>
      <button
        type="button"
        className="min-h-8 rounded-md border border-[var(--line)] px-2"
        onClick={() => setZoom(100)}
      >
        {zoom}%
      </button>
      <button
        type="button"
        className="min-h-8 min-w-8 rounded-md border border-[var(--line)] px-2"
        aria-label="Zoom in"
        onClick={() => setZoom(zoom + 10)}
      >
        +
      </button>
    </div>
  );
}
