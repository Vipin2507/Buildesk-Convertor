import { useDocStore } from '../store/docStore';

export function StatusBar({ showStatusChips = false }: { showStatusChips?: boolean }) {
  const doc = useDocStore((s) => (s.activeId ? s.docs[s.activeId] : null));
  if (!doc) return null;

  return (
    <footer
      className="flex h-[var(--statusbar-height)] shrink-0 items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-3 text-xs text-[var(--muted)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'max(12px, env(safe-area-inset-left))',
        paddingRight: 'max(12px, env(safe-area-inset-right))',
      }}
    >
      <span>
        Words: {doc.wordCount.toLocaleString()} · Pages: ~{doc.approxPages}
      </span>
      <span className="flex items-center gap-3" aria-live="polite">
        {showStatusChips && (
          <>
            <span>● {doc.saveState === 'saved' ? 'Autosaved' : doc.saveState}</span>
            <span>● {doc.syncState}</span>
          </>
        )}
        <span className={doc.htmlValid ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
          ● HTML {doc.htmlValid ? 'valid' : 'errors'}
        </span>
        {!showStatusChips && <span>● Autosaved</span>}
      </span>
    </footer>
  );
}
