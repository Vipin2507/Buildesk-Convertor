import { useDocStore } from '../store/docStore';
import { cn } from '../lib/utils';

export function ModeSwitch() {
  const viewMode = useDocStore((s) => s.viewMode);
  const setViewMode = useDocStore((s) => s.setViewMode);

  return (
    <div
      role="tablist"
      aria-label="Document view mode"
      className="inline-flex rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--bg)] p-0.5"
    >
      {(
        [
          { id: 'exact' as const, label: 'Exact Word view' },
          { id: 'editable' as const, label: 'Editable view' },
        ] as const
      ).map((tab) => {
        const selected = viewMode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              'min-h-9 rounded-[6px] px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
              selected
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--ink)]',
            )}
            onClick={() => setViewMode(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
