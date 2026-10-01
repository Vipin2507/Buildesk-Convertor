import { useEffect, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';
import { useDocStore } from '../store/docStore';
import { cn } from '../lib/utils';

interface SourcePaneProps {
  className?: string;
}

export function SourcePane({ className }: SourcePaneProps) {
  const doc = useDocStore((s) => (s.activeId ? s.docs[s.activeId] : null));
  const viewMode = useDocStore((s) => s.viewMode);
  const lastChangeOrigin = useDocStore((s) => s.lastChangeOrigin);
  const updateFromSource = useDocStore((s) => s.updateFromSource);
  const formatSource = useDocStore((s) => s.formatSource);
  const copySource = useDocStore((s) => s.copySource);
  const focused = useRef(false);

  const value = useMemo(() => {
    if (!doc) return '';
    return viewMode === 'exact' ? doc.exactHtml : doc.editableHtml;
  }, [doc, viewMode]);

  useEffect(() => {
    // reset origin after external loads so typing works
    if (lastChangeOrigin === 'load') {
      useDocStore.setState({ lastChangeOrigin: null });
    }
  }, [lastChangeOrigin, value]);

  if (!doc) return null;

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-[var(--code-bg)] text-[var(--code-ink)]', className)}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#22304a] bg-[var(--code-bg)] px-3 py-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--code-ink)]">
          HTML SOURCE
        </span>
        <span
          className={cn(
            'ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            doc.htmlValid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300',
          )}
        >
          ● {doc.htmlValid ? 'HTML valid' : 'HTML errors'}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            className="min-h-8 rounded-md px-2 text-xs font-medium text-[var(--code-ink)] hover:bg-white/5"
            onClick={() => void formatSource()}
          >
            Format
          </button>
          <button
            type="button"
            className="min-h-8 rounded-md px-2 text-xs font-medium text-[var(--code-ink)] hover:bg-white/5"
            onClick={() => void copySource()}
          >
            Copy
          </button>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        onFocusCapture={() => {
          focused.current = true;
        }}
        onBlurCapture={() => {
          focused.current = false;
        }}
      >
        <CodeMirror
          value={value}
          height="100%"
          theme="dark"
          extensions={[html(), EditorView.lineWrapping]}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
          onChange={(next) => {
            if (!focused.current && lastChangeOrigin === 'editor') return;
            updateFromSource(next);
          }}
          className="h-full text-[13px]"
        />
      </div>
    </div>
  );
}
